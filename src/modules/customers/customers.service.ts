import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { InvoiceRepository } from '../invoices/repository/invoice.repository.js';
import type {
  CreateCustomerDto,
  CustomerQueryDto,
  UpdateCustomerDto,
} from './dto/customer.dto.js';
import { CustomerRepository } from './repository/customer.repository.js';
import type { CustomerDocument } from './schemas/customer.schema.js';

@Injectable()
export class CustomersService {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly invoices: InvoiceRepository,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  private output(row: CustomerDocument) {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      companyName: row.companyName,
      phone: row.phone,
      email: row.email,
      address: row.address,
      city: row.city,
      npwp: row.npwp,
      paymentTermsDays: row.paymentTermsDays,
    };
  }

  async list(user: AuthenticatedPrincipal, query: CustomerQueryDto) {
    const { rows, total } = await this.customers.list(user.businessId, query);
    return {
      items: rows.map((row) => this.output(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async get(user: AuthenticatedPrincipal, id: string) {
    const row = await this.customers.findById(user.businessId, id);
    if (!row) throw new NotFoundException('Pelanggan tidak ditemukan.');
    return this.output(row);
  }

  async create(user: AuthenticatedPrincipal, dto: CreateCustomerDto) {
    await this.subscriptions.reserve(user.businessId, 'customer');
    try {
      return this.output(await this.customers.create(user.businessId, dto));
    } catch (error) {
      await this.subscriptions.release(user.businessId, 'customer');
      throw error;
    }
  }

  async update(
    user: AuthenticatedPrincipal,
    id: string,
    dto: UpdateCustomerDto,
  ) {
    const row = await this.customers.update(user.businessId, id, dto);
    if (!row) throw new NotFoundException('Pelanggan tidak ditemukan.');
    return this.output(row);
  }

  async delete(user: AuthenticatedPrincipal, id: string) {
    await this.get(user, id);
    if (await this.invoices.existsForCustomer(user.businessId, id)) {
      throw new ConflictException(
        'Pelanggan memiliki invoice dan tidak dapat dihapus.',
      );
    }
    if (await this.customers.delete(user.businessId, id)) await this.subscriptions.release(user.businessId, 'customer');
    return { deleted: true };
  }

  async summary(user: AuthenticatedPrincipal, id: string) {
    await this.get(user, id);
    return this.invoices.summary(user.businessId, id);
  }

  async invoicesForCustomer(
    user: AuthenticatedPrincipal,
    id: string,
    query: CustomerQueryDto,
  ) {
    await this.get(user, id);
    const { rows, total } = await this.invoices.listForCustomer(
      user.businessId,
      id,
      query.page,
      query.limit,
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        customerName: row.customerName,
        status: row.status,
        total: row.total,
        issueDate: row.issueDate,
        dueDate: row.dueDate,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
}
