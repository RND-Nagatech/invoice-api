import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { BusinessRepository } from '../businesses/repository/business.repository.js';
import { CustomerRepository } from '../customers/repository/customer.repository.js';
import { TemplatesService } from '../templates/templates.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import type {
  CreateInvoiceDto,
  InvoiceQueryDto,
  PartialPaymentDto,
  UpdateInvoiceDto,
} from './dto/invoice.dto.js';
import type { DashboardPeriod } from './dto/dashboard.dto.js';
import { InvoiceRepository } from './repository/invoice.repository.js';
import type { InvoiceDocument } from './schemas/invoice.schema.js';
import { calculateInvoice } from './utils/invoice-calculator.js';
import { decodeLogo } from '../../common/utils/image.js';
import type {
  PaymentPromiseDto,
  RepeatOrderDto,
  ServiceRecordDto,
} from './dto/customer-experience.dto.js';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly customers: CustomerRepository,
    private readonly subscription: SubscriptionsService,
    @Optional() private readonly businesses?: BusinessRepository,
    @Optional() private readonly templates?: TemplatesService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private output(row: InvoiceDocument) {
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const status =
      ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID'].includes(row.status) &&
      row.dueDate < today
        ? 'OVERDUE'
        : row.status;
    return {
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      businessId: row.businessId.toString(),
      publicId: row.publicId ?? '',
      templateId: row.templateId ?? 'modern-purple',
      showPageNumber: row.showPageNumber ?? true,
      customerId: row.customerId.toString(),
      customerName: row.customerName,
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      status,
      items: row.items.map((item) => ({
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      subtotal: row.subtotal,
      discount: row.discount,
      taxPercent: row.taxPercent,
      tax: row.tax,
      additionalFee: row.additionalFee,
      total: row.total,
      notes: row.notes,
      paidAt: row.paidAt,
      paidAmount: row.paidAmount ?? 0,
      version: row.version ?? 0,
      serviceRecord: row.serviceRecord
        ? {
            serialNumber: row.serviceRecord.serialNumber,
            workSummary: row.serviceRecord.workSummary,
            warrantyStartsAt: row.serviceRecord.warrantyStartsAt,
            warrantyUntil: row.serviceRecord.warrantyUntil,
            nextServiceAt: row.serviceRecord.nextServiceAt,
            photoCount: row.serviceRecord.photoCount ?? row.serviceRecord.photos?.length ?? 0,
          }
        : null,
      promisedPaymentDate: row.promisedPaymentDate ?? null,
      promiseNote: row.promiseNote ?? '',
      promiseCreatedAt: row.promiseCreatedAt ?? null,
      repeatRequestedAt: row.repeatRequestedAt ?? null,
      repeatMessage: row.repeatMessage ?? '',
      repeatRequestStatus: row.repeatRequestStatus ?? '',
      lastCustomerActivityAt: row.lastCustomerActivityAt ?? null,
      activitySeenAt: row.activitySeenAt ?? null,
    };
  }

  private dates(issue: string, due: string) {
    const issueDate = new Date(issue);
    const dueDate = new Date(due);
    if (
      Number.isNaN(issueDate.valueOf()) ||
      Number.isNaN(dueDate.valueOf()) ||
      dueDate < issueDate
    ) {
      throw new BadRequestException(
        'Jatuh tempo harus pada atau setelah tanggal invoice.',
      );
    }
    return { issueDate, dueDate };
  }

  async list(user: AuthenticatedPrincipal, query: InvoiceQueryDto) {
    const { rows, total } = await this.invoices.list(user.businessId, query);
    return {
      items: rows.map((row) => this.output(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async get(user: AuthenticatedPrincipal, id: string) {
    const row = await this.invoices.findById(user.businessId, id);
    if (!row) throw new NotFoundException('Invoice tidak ditemukan.');
    return this.output(row);
  }

  async create(user: AuthenticatedPrincipal, dto: CreateInvoiceDto) {
    const customer = await this.customers.findById(
      user.businessId,
      dto.customerId,
    );
    if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan.');
    const dates = this.dates(dto.issueDate, dto.dueDate);
    const amounts = calculateInvoice(dto);
    const templateId = dto.templateId ?? 'modern-purple';
    if (this.templates && !this.templates.exists(templateId)) {
      throw new BadRequestException('Template invoice tidak valid.');
    }
    if (this.templates?.get(templateId).accessTier === 'PRO')
      await this.subscription.assertFeature(user.businessId, 'templates');
    await this.subscription.reserve(user.businessId, 'invoice');
    let row: InvoiceDocument;
    try {
      const invoiceNumber = await this.invoices.nextNumber(
        user.businessId,
        dates.issueDate,
      );
      row = await this.invoices.create({
        businessId: user.businessId,
        customerId: customer.id,
        customerName: customer.name,
        invoiceNumber,
        publicId: this.newPublicId(),
        templateId,
        showPageNumber: dto.showPageNumber ?? true,
        ...dates,
        ...amounts,
        notes: dto.notes ?? '',
        status: 'DRAFT',
      });
    } catch (error) {
      await this.subscription.release(user.businessId, 'invoice');
      throw error;
    }
    return this.output(row);
  }

  async update(
    user: AuthenticatedPrincipal,
    id: string,
    dto: UpdateInvoiceDto,
  ) {
    const current = await this.invoices.findById(user.businessId, id);
    if (!current) throw new NotFoundException('Invoice tidak ditemukan.');
    if (current.status !== 'DRAFT')
      throw new ConflictException('Hanya draft yang dapat diubah.');
    const customerId = dto.customerId ?? current.customerId.toString();
    const customer = await this.customers.findById(user.businessId, customerId);
    if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan.');
    const dates = this.dates(
      dto.issueDate ?? current.issueDate.toISOString(),
      dto.dueDate ?? current.dueDate.toISOString(),
    );
    const amounts = calculateInvoice({
      items:
        dto.items ??
        current.items.map((item) => ({
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
        })),
      discount: dto.discount ?? current.discount,
      taxPercent: dto.taxPercent ?? current.taxPercent,
      additionalFee: dto.additionalFee ?? current.additionalFee,
    });
    const templateId = dto.templateId ?? current.templateId ?? 'modern-purple';
    if (this.templates && !this.templates.exists(templateId)) {
      throw new BadRequestException('Template invoice tidak valid.');
    }
    if (
      dto.templateId &&
      dto.templateId !== current.templateId &&
      this.templates?.get(templateId).accessTier === 'PRO'
    )
      await this.subscription.assertFeature(user.businessId, 'templates');
    const row = await this.invoices.updateDraft(user.businessId, id, {
      customerId,
      customerName: customer.name,
      ...dates,
      ...amounts,
      notes: dto.notes ?? current.notes,
      templateId,
      showPageNumber: dto.showPageNumber ?? current.showPageNumber ?? true,
    });
    if (!row)
      throw new ConflictException(
        'Invoice sudah berubah. Muat ulang lalu coba lagi.',
      );
    return this.output(row);
  }

  async delete(user: AuthenticatedPrincipal, id: string) {
    await this.get(user, id);
    if (!(await this.invoices.deleteDraft(user.businessId, id))) {
      throw new ConflictException('Hanya draft yang dapat dihapus.');
    }
    return { deleted: true };
  }

  async markPaid(user: AuthenticatedPrincipal, id: string) {
    const current = await this.invoices.findById(user.businessId, id);
    if (!current) throw new NotFoundException('Invoice tidak ditemukan.');
    const row = await this.invoices.transition(
      user.businessId,
      id,
      'PAID',
      current.total,
    );
    if (!row)
      throw new ConflictException(
        'Status invoice tidak dapat diubah menjadi lunas.',
      );
    return this.output(row);
  }

  async cancel(user: AuthenticatedPrincipal, id: string) {
    await this.get(user, id);
    const row = await this.invoices.transition(
      user.businessId,
      id,
      'CANCELLED',
    );
    if (!row) throw new ConflictException('Invoice tidak dapat dibatalkan.');
    return this.output(row);
  }

  async send(user: AuthenticatedPrincipal, id: string) {
    await this.get(user, id);
    const row = await this.invoices.transition(user.businessId, id, 'SENT');
    if (!row) throw new ConflictException('Invoice tidak dapat dikirim.');
    return this.output(row);
  }

  async viewed(publicId: string) {
    const invoice = await this.invoices.findByPublicId(publicId);
    if (!invoice)
      throw new NotFoundException('Invoice publik tidak ditemukan.');
    if (['DRAFT', 'SENT'].includes(invoice.status)) {
      await this.invoices.transition(
        invoice.businessId.toString(),
        invoice.id,
        'VIEWED',
      );
    }
  }

  async partialPaid(
    user: AuthenticatedPrincipal,
    id: string,
    dto: PartialPaymentDto,
  ) {
    const current = await this.invoices.findById(user.businessId, id);
    if (!current) throw new NotFoundException('Invoice tidak ditemukan.');
    const paidAmount = (current.paidAmount ?? 0) + dto.amount;
    if (paidAmount > current.total)
      throw new BadRequestException(
        'Jumlah pembayaran melebihi total invoice.',
      );
    const status = paidAmount === current.total ? 'PAID' : 'PARTIALLY_PAID';
    const row = await this.invoices.transition(
      user.businessId,
      id,
      status,
      paidAmount,
    );
    if (!row) throw new ConflictException('Pembayaran tidak dapat dicatat.');
    return this.output(row);
  }

  async void(user: AuthenticatedPrincipal, id: string) {
    await this.get(user, id);
    const row = await this.invoices.transition(user.businessId, id, 'VOID');
    if (!row) throw new ConflictException('Invoice tidak dapat di-void.');
    return this.output(row);
  }

  async duplicate(user: AuthenticatedPrincipal, id: string) {
    const current = await this.invoices.findById(user.businessId, id);
    if (!current) throw new NotFoundException('Invoice tidak ditemukan.');
    const customer = await this.customers.findById(
      user.businessId,
      current.customerId.toString(),
    );
    if (!customer)
      throw new ConflictException(
        'Pelanggan invoice ini sudah tidak tersedia.',
      );
    const issueDate = new Date();
    const days = Math.max(
      0,
      Math.round(
        (current.dueDate.getTime() - current.issueDate.getTime()) / 86400000,
      ),
    );
    return this.create(user, {
      customerId: customer.id,
      issueDate: issueDate.toISOString(),
      dueDate: new Date(issueDate.getTime() + days * 86400000).toISOString(),
      items: current.items,
      templateId: current.templateId ?? 'modern-purple',
      showPageNumber: current.showPageNumber ?? true,
      discount: current.discount,
      taxPercent: current.taxPercent,
      additionalFee: current.additionalFee,
      notes: current.notes,
    });
  }

  private dashboardRange(period: DashboardPeriod) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    if (period === 'year') {
      return {
        currentFrom: new Date(Date.UTC(year, 0, 1)),
        currentTo: new Date(Date.UTC(year + 1, 0, 1)),
        previousFrom: new Date(Date.UTC(year - 1, 0, 1)),
        previousTo: new Date(Date.UTC(year, 0, 1)),
      };
    }
    if (period === 'quarter') {
      const currentFromMonth = month - 2;
      return {
        currentFrom: new Date(Date.UTC(year, currentFromMonth, 1)),
        currentTo: new Date(Date.UTC(year, month + 1, 1)),
        previousFrom: new Date(Date.UTC(year, month - 5, 1)),
        previousTo: new Date(Date.UTC(year, currentFromMonth, 1)),
      };
    }
    return {
      currentFrom: new Date(Date.UTC(year, month, 1)),
      currentTo: new Date(Date.UTC(year, month + 1, 1)),
      previousFrom: new Date(Date.UTC(year, month - 1, 1)),
      previousTo: new Date(Date.UTC(year, month, 1)),
    };
  }

  private revenueChangePercent(current: number, previous: number): number {
    if (previous === 0) return current === 0 ? 0 : 100;
    return Math.round(((current - previous) / previous) * 100);
  }

  async dashboard(
    user: AuthenticatedPrincipal,
    period: DashboardPeriod = 'month',
  ) {
    const range = this.dashboardRange(period);
    const [summary, revenue, recent] = await Promise.all([
      this.invoices.summary(user.businessId),
      this.invoices.revenue(
        user.businessId,
        range.currentFrom,
        range.currentTo,
        range.previousFrom,
        range.previousTo,
      ),
      this.invoices.list(user.businessId, {
        page: 1,
        limit: 5,
        sort: 'DATE_DESC',
      }),
    ]);
    return {
      ...summary,
      totalRevenue: revenue.current,
      previousRevenue: revenue.previous,
      revenueChangePercent: this.revenueChangePercent(
        revenue.current,
        revenue.previous,
      ),
      revenuePeriod: period,
      recentInvoices: recent.rows.map((row) => this.output(row)),
    };
  }

  async shareLink(user: AuthenticatedPrincipal, id: string) {
    const current = await this.invoices.findById(user.businessId, id);
    if (!current) throw new NotFoundException('Invoice tidak ditemukan.');
    const publicId = current.publicId || this.newPublicId();
    const row = current.publicId
      ? current
      : await this.invoices.ensurePublicId(id, publicId);
    const stablePublicId = row?.publicId ?? publicId;
    const base = (
      this.config?.get<string>('PUBLIC_INVOICE_BASE_URL') ??
      'http://localhost:3000/api/v1/public/invoices'
    ).replace(/\/$/, '');
    return { publicId: stablePublicId, url: `${base}/${stablePublicId}/view` };
  }

  async followUp(
    user: AuthenticatedPrincipal,
    id: string,
    language: 'id' | 'en' = 'id',
  ) {
    await this.subscription.assertFeature(user.businessId, 'reminders');
    const invoice = await this.invoices.findById(user.businessId, id);
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    const balance = Math.max(0, invoice.total - (invoice.paidAmount ?? 0));
    if (['PAID', 'CANCELLED', 'VOID'].includes(invoice.status) || balance === 0)
      throw new BadRequestException(
        'Invoice ini tidak memerlukan pengingat pembayaran.',
      );
    const customer = await this.customers.findById(
      user.businessId,
      invoice.customerId.toString(),
    );
    const share = await this.shareLink(user, id);
    const money = (value: number) =>
      `Rp ${Math.round(value).toLocaleString('id-ID')}`;
    const due = invoice.dueDate.toLocaleDateString(
      language === 'en' ? 'en-GB' : 'id-ID',
      {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      },
    );
    const message =
      language === 'en'
        ? `Hello ${invoice.customerName}, a friendly reminder for invoice ${invoice.invoiceNumber}.\nTotal: ${money(invoice.total)}\nConfirmed payments: ${money(invoice.paidAmount ?? 0)}\nRemaining balance: ${money(balance)}\nDue date: ${due}\n\nView your invoice and payment details here:\n${share.url}\n\nIf you have already paid, please send your payment receipt so we can check it. Thank you.`
        : `Halo ${invoice.customerName}, kami ingin mengingatkan tagihan ${invoice.invoiceNumber}.\nTotal: ${money(invoice.total)}\nPembayaran terkonfirmasi: ${money(invoice.paidAmount ?? 0)}\nSisa tagihan: ${money(balance)}\nJatuh tempo: ${due}\n\nRincian invoice dan informasi pembayaran:\n${share.url}\n\nJika sudah membayar, silakan kirim bukti pembayaran agar dapat kami periksa. Terima kasih.`;
    return {
      invoiceNumber: invoice.invoiceNumber,
      phone: customer?.phone ?? '',
      message,
      balance,
      shareUrl: share.url,
    };
  }

  async publicPreview(publicId: string) {
    const invoice = await this.invoices.findByPublicId(publicId);
    if (!invoice)
      throw new NotFoundException('Invoice publik tidak ditemukan.');
    if (!this.businesses)
      throw new NotFoundException('Profil bisnis tidak ditemukan.');
    const [business, customer] = await Promise.all([
      this.businesses.findById(
        new Types.ObjectId(invoice.businessId.toString()),
      ),
      this.customers.findById(
        invoice.businessId.toString(),
        invoice.customerId.toString(),
      ),
    ]);
    if (!business)
      throw new NotFoundException('Profil bisnis tidak ditemukan.');
    await this.viewed(publicId);
    const visibleInvoice =
      (await this.invoices.findByPublicId(publicId)) ?? invoice;
    const output = this.output(visibleInvoice);
    const {
      businessId: _businessId,
      customerId: _customerId,
      id: _id,
      version: _version,
      ...publicInvoice
    } = output;
    return {
      invoice: publicInvoice,
      business: {
        name: business.name,
        logo: business.logo,
        address: business.address,
        phone: business.phone,
        email: business.email,
        website: business.website,
        qris: business.qris,
        bankAccounts: business.bankAccounts,
        defaultFooter: business.defaultFooter,
        brandColor: business.brandColor,
        secondaryColor: business.secondaryColor,
        fontPreset: business.fontPreset,
      },
      customer: customer
        ? {
            name: customer.name,
            companyName: customer.companyName,
            email: customer.email,
            phone: customer.phone,
            address: customer.address,
          }
        : { name: invoice.customerName },
    };
  }

  async publicInvoiceIdentity(publicId: string) {
    const invoice = await this.invoices.findByPublicId(publicId);
    if (!invoice)
      throw new NotFoundException('Invoice publik tidak ditemukan.');
    return {
      businessId: invoice.businessId.toString(),
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    };
  }

  async customerActivity(user: AuthenticatedPrincipal) {
    const rows = await this.invoices.customerActivity(user.businessId);
    return { items: rows.map((row) => this.output(row)) };
  }

  async markActivitySeen(
    user: AuthenticatedPrincipal,
    id: string,
    seenAt: string,
  ) {
    const invoice = await this.invoices.findById(user.businessId, id);
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    // Only acknowledge the activity that was actually read, not a newer request.
    const updated = await this.invoices.acknowledgeActivity(
      user.businessId,
      id,
      new Date(seenAt),
    );
    if (!updated)
      throw new ConflictException(
        'Ada aktivitas yang lebih baru. Muat ulang sebelum menandai sudah ditinjau.',
      );
    return this.output(updated);
  }

  async promisePayment(publicId: string, dto: PaymentPromiseDto) {
    const date = new Date(dto.date);
    const today = new Date(
      new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) +
        'T00:00:00+07:00',
    );
    if (
      !Number.isFinite(date.getTime()) ||
      date < today ||
      date.getTime() > today.getTime() + 365 * 86400000
    )
      throw new BadRequestException(
        'Pilih tanggal janji bayar mulai hari ini sampai satu tahun ke depan.',
      );
    const row = await this.invoices.publicExperience(
      publicId,
      {
        promisedPaymentDate: date,
        promiseNote: dto.note?.trim() ?? '',
        promiseCreatedAt: new Date(),
      },
      true,
    );
    if (!row)
      throw new ConflictException('Tagihan sudah selesai atau tidak tersedia.');
    return { accepted: true };
  }

  async requestRepeat(publicId: string, dto: RepeatOrderDto) {
    const row = await this.invoices.publicExperience(publicId, {
      repeatRequestedAt: new Date(),
      repeatMessage: dto.message?.trim() ?? '',
      repeatRequestStatus: 'OPEN',
    });
    if (!row)
      throw new ConflictException('Invoice tidak tersedia untuk pesan ulang.');
    return { accepted: true };
  }

  async serviceRecord(user: AuthenticatedPrincipal, id: string) {
    const row = await this.invoices.findById(user.businessId, id, true);
    if (!row) throw new NotFoundException('Invoice tidak ditemukan.');
    return { invoice: this.output(row), record: row.serviceRecord ?? null };
  }

  async saveServiceRecord(
    user: AuthenticatedPrincipal,
    id: string,
    dto: ServiceRecordDto,
  ) {
    const starts = dto.warrantyStartsAt ? new Date(dto.warrantyStartsAt) : null;
    const until = dto.warrantyUntil ? new Date(dto.warrantyUntil) : null;
    if (until && !starts)
      throw new BadRequestException('Isi tanggal mulai garansi.');
    if (starts && until && until < starts)
      throw new BadRequestException(
        'Tanggal akhir garansi harus setelah tanggal mulai.',
      );
    for (const photo of dto.photos) decodeLogo(photo);
    const row = await this.invoices.updateExperience(user.businessId, id, {
      serviceRecord: {
        serialNumber: dto.serialNumber?.trim() ?? '',
        workSummary: dto.workSummary?.trim() ?? '',
        warrantyStartsAt: starts,
        warrantyUntil: until,
        nextServiceAt: dto.nextServiceAt ? new Date(dto.nextServiceAt) : null,
        photos: dto.photos,
        photoCount: dto.photos.length,
      },
    });
    if (!row)
      throw new ConflictException(
        'Invoice tidak ditemukan atau sudah dibatalkan.',
      );
    return { invoice: this.output(row), record: row.serviceRecord };
  }

  async publicServicePhoto(publicId: string, index: number) {
    const row = await this.invoices.findByPublicId(publicId, true);
    if (!row || ['VOID', 'CANCELLED'].includes(row.status))
      throw new NotFoundException('Foto tidak tersedia.');
    const photo =
      Number.isInteger(index) && index >= 0 && index < 3
        ? row.serviceRecord?.photos?.[index]
        : undefined;
    if (!photo) throw new NotFoundException('Foto tidak tersedia.');
    return decodeLogo(photo);
  }

  private newPublicId(): string {
    return randomBytes(24).toString('base64url');
  }
}
