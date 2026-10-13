import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ResendMailService } from '../auth/email/resend-mail.service.js';
import { CustomerRepository } from '../customers/repository/customer.repository.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { InvoiceRepository } from '../invoices/repository/invoice.repository.js';
import type { CreateReceiptDto, ReceiptQueryDto } from './dto/receipt.dto.js';
import { ReceiptRepository } from './repository/receipt.repository.js';
import type { ReceiptDocument } from './schemas/receipt.schema.js';

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly receipts: ReceiptRepository,
    private readonly invoices: InvoiceRepository,
    private readonly customers: CustomerRepository,
    private readonly mail: ResendMailService,
  ) {}
  private output(row: ReceiptDocument, invoiceNumber = '') {
    return {
      id: row.id,
      receiptNumber: row.receiptNumber,
      invoiceId: row.invoiceId.toString(),
      invoiceNumber: invoiceNumber || row.invoiceId.toString(),
      customerName: row.customerName,
      amount: row.amount,
      issuedAt: row.issuedAt,
      paymentMethod: row.paymentMethod,
      notes: row.notes,
      emailStatus: row.emailStatus,
      emailSentAt: row.emailSentAt,
      emailError: row.emailError,
    };
  }
  async list(user: AuthenticatedPrincipal, query: ReceiptQueryDto) {
    const result = await this.receipts.list(user.businessId, query);
    return {
      items: await Promise.all(
        result.rows.map(async (row) => {
          const invoice = await this.invoices.findById(
            user.businessId,
            row.invoiceId.toString(),
          );
          return this.output(row, invoice?.invoiceNumber);
        }),
      ),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
  async get(user: AuthenticatedPrincipal, id: string) {
    const row = await this.receipts.findById(user.businessId, id);
    if (!row) throw new NotFoundException('Kwitansi tidak ditemukan.');
    const invoice = await this.invoices.findById(
      user.businessId,
      row.invoiceId.toString(),
    );
    return this.output(row, invoice?.invoiceNumber);
  }
  async create(user: AuthenticatedPrincipal, dto: CreateReceiptDto) {
    const invoice = await this.invoices.findById(
      user.businessId,
      dto.invoiceId,
    );
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    const paidAmount = invoice.paidAmount ?? 0;
    if (
      invoice.status !== 'PAID' &&
      invoice.status !== 'PARTIALLY_PAID' &&
      paidAmount <= 0
    )
      throw new BadRequestException(
        'Kwitansi hanya dapat dibuat setelah ada pembayaran yang dikonfirmasi.',
      );
    const receiptableAmount = paidAmount > 0 ? paidAmount : invoice.total;
    if (dto.amount > receiptableAmount)
      throw new BadRequestException(
        'Nominal kwitansi melebihi jumlah yang sudah dibayar.',
      );
    if (await this.receipts.findByInvoiceId(user.businessId, dto.invoiceId))
      throw new ConflictException('Invoice ini sudah memiliki kwitansi.');
    const issuedAt = new Date(dto.issuedAt);
    let row: ReceiptDocument;
    try {
      row = await this.receipts.create({
        businessId: new Types.ObjectId(user.businessId),
        invoiceId: invoice._id,
        receiptNumber: await this.receipts.nextNumber(
          user.businessId,
          issuedAt,
        ),
        customerName: invoice.customerName,
        amount: dto.amount,
        issuedAt,
        paymentMethod: dto.paymentMethod ?? '',
        notes: dto.notes ?? '',
      });
    } catch (error) {
      if (this.isDuplicateKey(error))
        throw new ConflictException('Invoice ini sudah memiliki kwitansi.');
      throw error;
    }

    const customer = await this.customers.findById(
      user.businessId,
      invoice.customerId.toString(),
    );
    const recipient = customer?.email?.trim();
    if (recipient) {
      try {
        await this.mail.sendReceipt(recipient, {
          receiptNumber: row.receiptNumber,
          invoiceNumber: invoice.invoiceNumber,
          customerName: row.customerName,
          amount: row.amount,
          paymentMethod: row.paymentMethod,
          issuedAt: row.issuedAt,
          idempotencyKey: `receipt-email-${row.id}`,
        });
        row =
          (await this.receipts.updateEmailStatus(
            user.businessId,
            row.id,
            'SENT',
          )) ?? row;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Email tidak terkirim.';
        this.logger.warn(`Receipt email failed for ${row.id}: ${message}`);
        row =
          (await this.receipts.updateEmailStatus(
            user.businessId,
            row.id,
            'FAILED',
            'Kwitansi tersimpan, tetapi email belum terkirim.',
          )) ?? row;
      }
    }
    return this.output(row, invoice.invoiceNumber);
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }
}
