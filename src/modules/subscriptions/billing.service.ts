import { decodeImage } from '../../common/utils/image.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Types, type Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { UserRepository } from '../users/repository/user.repository.js';
import { ResendMailService } from '../auth/email/resend-mail.service.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { SubscriptionPaymentRepository } from './repository/subscription-payment.repository.js';
import type { SubscriptionPaymentDocument } from './schemas/subscription-payment.schema.js';
import { SubscriptionsService } from './subscriptions.service.js';

export const decodeProof = decodeImage;
export const htmlEscape = (value: string | null | undefined): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  constructor(
    private readonly payments: SubscriptionPaymentRepository,
    private readonly subscriptions: SubscriptionsService,
    private readonly users: UserRepository,
    private readonly mail: ResendMailService,
    private readonly config: ConfigService,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  output(row: SubscriptionPaymentDocument) {
    return {
      id: row.id,
      reference: row.reference,
      amount: row.amount,
      mode: row.mode,
      status: row.status,
      submittedAt: row.submittedAt,
      reviewedAt: row.reviewedAt,
      reviewReason: row.reviewReason,
      notificationStatus: row.notificationStatus,
      hasProof: !!row.submittedAt,
    };
  }
  private requireSetup() {
    if (
      !this.config.get<string>('BILLING_REVIEW_EMAIL') ||
      !this.config.get<string>('BILLING_ADMIN_PASSWORD')
    )
      throw new ServiceUnavailableException(
        'Review langganan belum dikonfigurasi oleh admin.',
      );
  }
  async checkout(user: AuthenticatedPrincipal) {
    this.requireSetup();
    await this.subscriptions.current(user);
    const account = await this.users.findById(user.id);
    if (!account) throw new NotFoundException('Akun tidak ditemukan.');
    const row = await this.payments.open(user.businessId, {
      businessId: new Types.ObjectId(user.businessId),
      userId: new Types.ObjectId(user.id),
      email: account.email,
      name: account.name,
      amount: Number(this.config.get('SUBSCRIPTION_PRO_PRICE') ?? 129000),
      mode: this.config.get('SUBSCRIPTION_PAYMENT_MODE') ?? 'demo',
      reference: 'PRO-' + randomUUID().slice(0, 12).toUpperCase(),
      status: 'PENDING',
      open: true,
    });
    if (!row)
      throw new ConflictException('Pengajuan belum dapat dibuat. Coba lagi.');
    return this.output(row);
  }
  async latest(user: AuthenticatedPrincipal) {
    const row = await this.payments.latest(user.businessId);
    return row ? this.output(row) : null;
  }
  async submit(user: AuthenticatedPrincipal, id: string, content: string) {
    this.requireSetup();
    const existing = await this.payments.find(id, user.businessId);
    if (
      !existing ||
      existing.mode !== (this.config.get('SUBSCRIPTION_PAYMENT_MODE') ?? 'demo')
    )
      throw new ConflictException(
        'Mode pembayaran berubah. Batalkan pengajuan ini dan buat pengajuan baru.',
      );
    const proof = decodeProof(content);
    const row = await this.payments.submit(
      id,
      user.businessId,
      proof.buffer,
      proof.mime,
    );
    if (!row)
      throw new ConflictException(
        'Pengajuan sudah dikirim atau tidak tersedia.',
      );
    await this.notify(id);
    return this.output((await this.payments.find(id, user.businessId))!);
  }
  async retry(user: AuthenticatedPrincipal, id: string) {
    const row = await this.payments.find(id, user.businessId);
    if (!row || row.status !== 'AWAITING_REVIEW')
      throw new ConflictException(
        'Tidak ada pengajuan yang menunggu verifikasi.',
      );
    if (row.notificationStatus !== 'SENT') await this.notify(id);
    return this.output((await this.payments.find(id, user.businessId))!);
  }
  private async notify(id: string) {
    const row = await this.payments.find(id, undefined, true);
    if (!row?.proof) return;
    const url =
      (
        this.config.get<string>('BILLING_PUBLIC_BASE_URL') ??
        'http://localhost:3000/api/v1/subscriptions'
      ).replace(/\/$/, '') +
      '/admin/' +
      row.id;
    try {
      await this.mail.sendBillingReview(
        this.config.get<string>('BILLING_REVIEW_EMAIL')!,
        'Review langganan ' +
          row.reference +
          (row.mode === 'demo' ? ' [DEMO]' : ''),
        '<h2>' +
          (row.mode === 'demo'
            ? 'Pengajuan DEMO — tidak ada pembayaran uang'
            : 'Bukti pembayaran Pro') +
          '</h2><p>Akun: ' +
          htmlEscape(row.name) +
          ' (' +
          htmlEscape(row.email) +
          ')</p><p>Referensi: ' +
          htmlEscape(row.reference) +
          '<br>Nominal: Rp ' +
          row.amount.toLocaleString('id-ID') +
          '<br>Masa aktif: 1 bulan sejak disetujui.</p><p>' +
          (row.mode === 'demo'
            ? 'Setujui untuk mencoba aktivasi Pro.'
            : 'Cocokkan bukti dengan transaksi masuk QRIS sebelum menyetujui.') +
          '</p><a href="' +
          htmlEscape(url) +
          '">Tinjau Pembayaran</a>',
        row.proof,
        row.proofMime ?? 'image/png',
      );
      await this.payments.notify(id, 'SENT');
    } catch {
      this.logger.warn(
        'Billing review email failed; submission remains available in the admin panel.',
      );
      await this.payments.notify(id, 'FAILED');
    }
  }
  async cancel(user: AuthenticatedPrincipal, id: string) {
    const row = await this.payments.cancel(id, user.businessId);
    if (!row)
      throw new ConflictException(
        'Hanya pengajuan yang belum dikirim yang bisa dibatalkan.',
      );
    return this.output(row);
  }
  async review(id: string, decision: 'approve' | 'reject', reason: string) {
    if (decision === 'reject' && !reason.trim())
      throw new BadRequestException('Alasan penolakan wajib diisi.');
    // Payment decision and activation commit together. Retried approvals never extend twice.
    return this.connection.transaction(async (session) => {
      const current = await this.payments.find(id, undefined, false, session);
      if (!current) throw new NotFoundException('Pengajuan tidak ditemukan.');
      if (
        decision === 'approve' &&
        current.mode !==
          (this.config.get('SUBSCRIPTION_PAYMENT_MODE') ?? 'demo')
      )
        throw new ConflictException(
          'Pengajuan ini berasal dari mode pembayaran sebelumnya. Buat pengajuan baru.',
        );
      const status = decision === 'approve' ? 'APPROVED' : 'REJECTED';
      if (current.status === status) return this.output(current);
      if (current.status !== 'AWAITING_REVIEW')
        throw new ConflictException(
          'Pengajuan ini tidak sedang menunggu review.',
        );
      const row = await this.payments.decide(
        id,
        status,
        reason.trim(),
        session,
      );
      if (!row) throw new ConflictException('Pengajuan sudah ditinjau.');
      if (decision === 'approve')
        await this.subscriptions.activate(
          row.businessId.toString(),
          session,
          row.mode,
        );
      return this.output(row);
    });
  }
  adminList() {
    return this.payments.list();
  }
  async adminGet(id: string, proof = false) {
    const row = await this.payments.find(id, undefined, proof);
    if (!row) throw new NotFoundException('Pengajuan tidak ditemukan.');
    return row;
  }
}
