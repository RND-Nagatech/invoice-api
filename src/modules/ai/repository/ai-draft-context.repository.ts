import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from '../../customers/schemas/customer.schema.js';
import { Invoice } from '../../invoices/schemas/invoice.schema.js';
import { Item } from '../../items/schemas/item.schema.js';

export function canonicalCustomerName(value: string): string {
  return value
    .trim()
    .replace(/^(?:pak|bapak|bu|ibu)\.?\s+/i, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('id-ID');
}

function exactPattern(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
}

/** Read-only lookups, always scoped to the authenticated business. */
@Injectable()
export class AiDraftContextRepository {
  constructor(
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
    @InjectModel(Item.name) private readonly items: Model<Item>,
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
  ) {}

  async exactCustomers(businessId: string, name: string) {
    const canonical = canonicalCustomerName(name);
    const pattern = `^(?:(?:pak|bapak|bu|ibu)\\.?\\s+)?${exactPattern(canonical)}$`;
    const rows = await this.customers
      .find({
        businessId,
        $or: [
          { name: { $regex: pattern, $options: 'i' } },
          { companyName: { $regex: pattern, $options: 'i' } },
        ],
      })
      .limit(3)
      .maxTimeMS(5000)
      .lean()
      .exec();
    return rows.filter(
      (row) =>
        canonicalCustomerName(row.name) === canonical ||
        canonicalCustomerName(row.companyName ?? '') === canonical,
    );
  }

  async exactCatalogItems(businessId: string, name: string) {
    return this.items
      .find({
        businessId,
        active: true,
        name: { $regex: `^${exactPattern(name)}$`, $options: 'i' },
      })
      .limit(2)
      .maxTimeMS(5000)
      .lean()
      .exec();
  }

  async latestInvoice(businessId: string, customerId: string) {
    return this.invoices
      .findOne({
        businessId,
        customerId,
        status: { $nin: ['CANCELLED', 'VOID'] },
      })
      .sort({ createdAt: -1, _id: -1 })
      .maxTimeMS(5000)
      .lean()
      .exec();
  }
}
