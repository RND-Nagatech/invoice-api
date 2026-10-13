import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { CustomerRepository } from '../customers/repository/customer.repository.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import type {
  CreateQuotationDto,
  QuotationQueryDto,
  UpdateQuotationDto,
} from './dto/quotation.dto.js';
import { QuotationRepository } from './repository/quotation.repository.js';
import type { QuotationDocument } from './schemas/quotation.schema.js';

const calculate = (
  input: Pick<CreateQuotationDto, 'items' | 'discount' | 'taxPercent'>,
) => {
  const items = input.items.map((item) => ({
    name: item.name,
    description: item.description ?? '',
    quantity: item.quantity,
    unit: item.unit || 'unit',
    unitPrice: item.unitPrice,
    lineTotal: item.quantity * item.unitPrice,
  }));
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = input.discount ?? 0;
  if (discount > subtotal)
    throw new BadRequestException('Diskon tidak boleh melebihi subtotal.');
  const taxPercent = input.taxPercent ?? 0;
  const tax = Math.round(((subtotal - discount) * taxPercent) / 100);
  return {
    items,
    subtotal,
    discount,
    taxPercent,
    tax,
    total: subtotal - discount + tax,
  };
};

@Injectable()
export class QuotationsService {
  constructor(
    private readonly quotations: QuotationRepository,
    private readonly customers: CustomerRepository,
    private readonly invoices: InvoicesService,
  ) {}

  private output(row: QuotationDocument) {
    return {
      id: row.id,
      quotationNumber: row.quotationNumber,
      customerId: row.customerId.toString(),
      customerName: row.customerName,
      issueDate: row.issueDate,
      validUntil: row.validUntil,
      status: row.status,
      items: row.items,
      subtotal: row.subtotal,
      discount: row.discount,
      taxPercent: row.taxPercent,
      tax: row.tax,
      total: row.total,
      notes: row.notes,
      invoiceId: row.invoiceId?.toString() ?? null,
    };
  }
  async list(user: AuthenticatedPrincipal, query: QuotationQueryDto) {
    const result = await this.quotations.list(user.businessId, query);
    return {
      items: result.rows.map((row) => this.output(row)),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
  async get(user: AuthenticatedPrincipal, id: string) {
    const row = await this.quotations.findById(user.businessId, id);
    if (!row) throw new NotFoundException('Penawaran tidak ditemukan.');
    return this.output(row);
  }
  async create(user: AuthenticatedPrincipal, dto: CreateQuotationDto) {
    const customer = await this.customers.findById(
      user.businessId,
      dto.customerId,
    );
    if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan.');
    const issueDate = new Date(dto.issueDate);
    const validUntil = new Date(dto.validUntil);
    if (validUntil < issueDate)
      throw new BadRequestException(
        'Berlaku sampai harus setelah tanggal penawaran.',
      );
    const row = await this.quotations.create({
      businessId: user.businessId,
      customerId: customer.id,
      customerName: customer.name,
      quotationNumber: await this.quotations.nextNumber(
        user.businessId,
        issueDate,
      ),
      issueDate,
      validUntil,
      status: 'DRAFT',
      ...calculate(dto),
      notes: dto.notes ?? '',
    });
    return this.output(row);
  }
  async update(
    user: AuthenticatedPrincipal,
    id: string,
    dto: UpdateQuotationDto,
  ) {
    const current = await this.quotations.findById(user.businessId, id);
    if (!current) throw new NotFoundException('Penawaran tidak ditemukan.');
    if (current.status !== 'DRAFT')
      throw new ConflictException('Hanya draft yang dapat diubah.');
    const customerId = dto.customerId ?? current.customerId.toString();
    const customer = await this.customers.findById(user.businessId, customerId);
    if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan.');
    const items =
      dto.items ??
      current.items.map((item) => ({
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
      }));
    const issueDate = new Date(
      dto.issueDate ?? current.issueDate.toISOString(),
    );
    const validUntil = new Date(
      dto.validUntil ?? current.validUntil.toISOString(),
    );
    if (validUntil < issueDate)
      throw new BadRequestException(
        'Berlaku sampai harus setelah tanggal penawaran.',
      );
    const row = await this.quotations.updateDraft(user.businessId, id, {
      customerId,
      customerName: customer.name,
      issueDate,
      validUntil,
      ...calculate({
        items,
        discount: dto.discount ?? current.discount,
        taxPercent: dto.taxPercent ?? current.taxPercent,
      }),
      notes: dto.notes ?? current.notes,
    });
    if (!row)
      throw new ConflictException(
        'Penawaran sudah berubah. Muat ulang lalu coba lagi.',
      );
    return this.output(row);
  }
  async delete(user: AuthenticatedPrincipal, id: string) {
    await this.get(user, id);
    if (!(await this.quotations.deleteDraft(user.businessId, id)))
      throw new ConflictException('Hanya draft yang dapat dihapus.');
    return { deleted: true };
  }
  async transition(
    user: AuthenticatedPrincipal,
    id: string,
    from: 'DRAFT' | 'SENT',
    status: 'SENT' | 'ACCEPTED' | 'REJECTED',
  ) {
    await this.get(user, id);
    const row = await this.quotations.transition(
      user.businessId,
      id,
      from,
      status,
    );
    if (!row)
      throw new ConflictException('Status penawaran tidak dapat diubah.');
    return this.output(row);
  }
  async convert(user: AuthenticatedPrincipal, id: string) {
    const current = await this.quotations.findById(user.businessId, id);
    if (!current) throw new NotFoundException('Penawaran tidak ditemukan.');
    if (!['SENT', 'ACCEPTED'].includes(current.status))
      throw new ConflictException(
        'Penawaran harus dikirim atau diterima sebelum dikonversi.',
      );
    const invoice = await this.invoices.create(user, {
      customerId: current.customerId.toString(),
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      items: current.items.map((item) => ({
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
      })),
      discount: current.discount,
      taxPercent: current.taxPercent,
      notes: current.notes,
    });
    const row = await this.quotations.transition(
      user.businessId,
      id,
      current.status,
      'CONVERTED',
      { invoiceId: invoice.id },
    );
    if (!row) throw new ConflictException('Penawaran sudah berubah.');
    return { quotation: this.output(row), invoice };
  }
}
