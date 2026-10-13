import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { InvoiceRepository } from '../invoices/repository/invoice.repository.js';
import type {
  CreatePaymentDto,
  PaymentWebhookDto,
  PublicPaymentProofDto,
} from './dto/payment.dto.js';
import { decodeImage } from '../../common/utils/image.js';
import { PaymentRepository } from './repository/payment.repository.js';
import type { PaymentDocument } from './schemas/payment.schema.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly invoices: InvoiceRepository,
    private readonly config: ConfigService,
  ) {}
  private output(row: PaymentDocument, invoiceNumber = '') {
    return {
      id: row.id,
      invoiceId: row.invoiceId.toString(),
      invoiceNumber: invoiceNumber || row.invoiceId.toString(),
      provider: row.provider,
      providerReference: row.providerReference,
      amount: row.amount,
      status: row.status,
      checkoutUrl: row.checkoutUrl,
      failureReason: row.failureReason,
      hasProof: !!row.submittedAt,
      submittedAt: row.submittedAt ?? null,
      senderName: row.senderName ?? '',
      note: row.note ?? '',
      source: row.source ?? 'OWNER',
    };
  }
  async list(user: AuthenticatedPrincipal, invoiceId?: string) {
    const rows = await this.payments.list(user.businessId, invoiceId);
    return {
      items: await Promise.all(
        rows.map(async (row) => {
          const invoice = await this.invoices.findById(
            user.businessId,
            row.invoiceId.toString(),
          );
          return this.output(row, invoice?.invoiceNumber);
        }),
      ),
    };
  }
  async get(user: AuthenticatedPrincipal, id: string) {
    const row = await this.payments.findById(user.businessId, id);
    if (!row) throw new NotFoundException('Pembayaran tidak ditemukan.');
    const invoice = await this.invoices.findById(
      user.businessId,
      row.invoiceId.toString(),
    );
    return this.output(row, invoice?.invoiceNumber);
  }
  async create(user: AuthenticatedPrincipal, dto: CreatePaymentDto) {
    const invoice = await this.invoices.findById(
      user.businessId,
      dto.invoiceId,
    );
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    if (dto.provider !== 'MANUAL')
      throw new ServiceUnavailableException(
        'SingaPay sedang dinonaktifkan. Gunakan pembayaran manual.',
      );
    const reference = dto.idempotencyKey
      ? `manual_${user.businessId}_${dto.idempotencyKey}`
      : `manual_${randomUUID().replaceAll('-', '')}`;
    if (dto.idempotencyKey) {
      const existing = await this.payments.findByReference(reference);
      if (existing) {
        if (
          existing.invoiceId.toString() !== dto.invoiceId ||
          (dto.amount !== undefined && existing.amount !== dto.amount)
        )
          throw new ConflictException(
            'Permintaan pembayaran sudah dipakai untuk nominal lain.',
          );
        return this.output(existing, invoice.invoiceNumber);
      }
    }
    if (['PAID', 'VOID', 'CANCELLED'].includes(invoice.status))
      throw new BadRequestException('Invoice sudah selesai atau dibatalkan.');
    const balance = invoice.total - (invoice.paidAmount ?? 0);
    const amount = dto.amount ?? balance;
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > balance)
      throw new BadRequestException(
        'Nominal pembayaran harus lebih dari nol dan tidak melebihi sisa tagihan.',
      );
    let row: PaymentDocument;
    try {
      row = await this.payments.create({
        businessId: new Types.ObjectId(user.businessId),
        invoiceId: invoice._id,
        provider: 'MANUAL',
        amount,
        providerReference: reference,
        status: 'PENDING',
        checkoutUrl: '',
      });
    } catch (error) {
      if (
        dto.idempotencyKey &&
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        const existing = await this.payments.findByReference(reference);
        if (
          existing &&
          existing.invoiceId.toString() === dto.invoiceId &&
          existing.amount === amount
        )
          return this.output(existing, invoice.invoiceNumber);
      }
      throw error;
    }
    return this.output(row, invoice.invoiceNumber);
  }

  /**
   * Manual transfers stay pending until the business owner explicitly
   * confirms that the money has arrived. The operation is idempotent so a
   * repeated tap cannot create another payment or change a paid invoice back.
   */
  async confirmManual(user: AuthenticatedPrincipal, id: string) {
    const payment = await this.payments.findById(user.businessId, id);
    if (!payment) throw new NotFoundException('Pembayaran tidak ditemukan.');
    if (payment.provider !== 'MANUAL')
      throw new BadRequestException(
        'Hanya pembayaran manual yang perlu dikonfirmasi.',
      );
    if (payment.status === 'PAID') {
      const invoice = await this.invoices.findById(
        user.businessId,
        payment.invoiceId.toString(),
      );
      return this.output(payment, invoice?.invoiceNumber);
    }
    if (!['PENDING', 'PROCESSING'].includes(payment.status))
      throw new BadRequestException(
        'Pembayaran ini sudah tidak menunggu konfirmasi.',
      );

    const invoice = await this.invoices.findById(
      user.businessId,
      payment.invoiceId.toString(),
    );
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    if (
      payment.status === 'PENDING' &&
      !(await this.payments.claimManual(user.businessId, id))
    ) {
      const latest = await this.payments.findById(user.businessId, id);
      if (latest?.status === 'PAID')
        return this.output(latest, invoice.invoiceNumber);
      // The invoice ledger deduplicates a concurrent retry by reference. A
      // rejection, however, must never be converted back into a payment.
      if (latest?.status !== 'PROCESSING')
        throw new ConflictException(
          'Pembayaran sudah diproses. Muat ulang status terbaru.',
        );
    }
    try {
      await this.applyPayment(payment);
    } catch (error) {
      // A known ledger conflict has made no financial write. Leave the proof
      // reviewable/rejectable. Unexpected failures stay recoverable in PROCESSING.
      if (error instanceof ConflictException)
        await this.payments.releaseManual(user.businessId, id);
      throw error;
    }
    const updated = await this.payments.updateStatusById(
      user.businessId,
      payment.id,
      'PAID',
    );
    if (!updated) throw new NotFoundException('Pembayaran tidak ditemukan.');
    return this.output(updated, invoice.invoiceNumber);
  }

  async submitPublicProof(publicId: string, dto: PublicPaymentProofDto) {
    const invoice = await this.invoices.findByPublicId(publicId);
    if (!invoice || ['PAID', 'VOID', 'CANCELLED'].includes(invoice.status))
      throw new ConflictException('Invoice sudah selesai atau tidak tersedia.');
    const balance = invoice.total - (invoice.paidAmount ?? 0);
    if (
      !Number.isSafeInteger(dto.amount) ||
      dto.amount <= 0 ||
      dto.amount > balance
    )
      throw new BadRequestException(
        'Nominal bukti harus lebih dari nol dan tidak melebihi sisa tagihan.',
      );
    const image = decodeImage(dto.proofBase64, 2 * 1024 * 1024);
    const reference = `customer_${invoice.id}_${dto.requestId}`;
    const existing = await this.payments.findByReference(reference);
    if (existing) {
      if (existing.amount !== dto.amount)
        throw new ConflictException(
          'Gunakan pengajuan baru untuk nominal berbeda.',
        );
      return { accepted: true, status: 'PENDING' };
    }
    try {
      await this.payments.create({
        businessId: invoice.businessId,
        invoiceId: invoice._id,
        provider: 'MANUAL',
        providerReference: reference,
        amount: dto.amount,
        status: 'PENDING',
        source: 'CUSTOMER',
        proof: image.buffer,
        proofMime: image.mime,
        submittedAt: new Date(),
        senderName: dto.senderName?.trim() ?? '',
        note: dto.note?.trim() ?? '',
      });
    } catch (error) {
      if (!(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 11000
      ))
        throw error;
      const duplicate = await this.payments.findByReference(reference);
      if (!duplicate || duplicate.amount !== dto.amount)
        throw new ConflictException('Pengajuan pembayaran berubah. Coba lagi.');
    }
    await this.invoices.publicExperience(publicId, {});
    return { accepted: true, status: 'PENDING' };
  }

  async proof(user: AuthenticatedPrincipal, id: string) {
    const payment = await this.payments.findProof(user.businessId, id);
    if (!payment?.proof)
      throw new NotFoundException('Bukti pembayaran tidak tersedia.');
    return { buffer: payment.proof, mime: payment.proofMime };
  }

  async rejectManual(user: AuthenticatedPrincipal, id: string, reason: string) {
    if (!reason.trim()) throw new BadRequestException('Isi alasan penolakan.');
    const updated = await this.payments.rejectManual(
      user.businessId,
      id,
      reason.trim(),
    );
    if (!updated)
      throw new ConflictException(
        'Pembayaran sudah diproses atau tidak tersedia.',
      );
    return this.output(updated);
  }

  private async applyPayment(payment: PaymentDocument) {
    const invoice = await this.invoices.applyPayment(
      payment.businessId.toString(),
      payment.invoiceId.toString(),
      payment.providerReference,
      payment.amount,
    );
    if (!invoice)
      throw new ConflictException(
        'Pembayaran tidak dapat dikonfirmasi. Muat ulang sisa tagihan dan status invoice.',
      );
    return invoice;
  }
  async webhook(
    provider: string,
    signature: string | undefined,
    dto: PaymentWebhookDto,
  ) {
    if (provider.toUpperCase() === 'SINGAPAY')
      throw new ServiceUnavailableException(
        'SingaPay sedang dinonaktifkan. Gunakan pembayaran manual.',
      );
    const secret = this.config.get<string>('PAYMENT_WEBHOOK_SECRET') ?? '';
    const expected = createHmac('sha256', secret)
      .update(`${provider}:${dto.providerReference}:${dto.status}`)
      .digest('hex');
    if (
      !signature ||
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new UnauthorizedException('Signature webhook tidak valid.');
    const payment = await this.payments.findByReference(dto.providerReference);
    if (!payment) throw new NotFoundException('Pembayaran tidak ditemukan.');
    if (
      payment.provider.toLowerCase() !== provider.toLowerCase() ||
      payment.provider === 'MANUAL'
    )
      throw new UnauthorizedException('Provider pembayaran tidak sesuai.');
    if (payment.status === 'PAID') return { accepted: true, duplicate: true };
    if (dto.status === 'PAID') await this.applyPayment(payment);
    const row = await this.payments.updateStatus(
      dto.providerReference,
      dto.status,
      dto.eventId ?? '',
    );
    const invoice = await this.invoices.findById(
      payment.businessId.toString(),
      payment.invoiceId.toString(),
    );
    return row ? this.output(row, invoice?.invoiceNumber) : { accepted: true };
  }

  async singapayWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ) {
    void rawBody;
    void headers;
    throw new ServiceUnavailableException(
      'SingaPay sedang dinonaktifkan. Gunakan pembayaran manual.',
    );
  }
}
