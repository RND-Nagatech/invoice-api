import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Invoice } from '../../invoices/schemas/invoice.schema.js';

@Injectable()
export class ReportsRepository {
  constructor(
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
  ) {}

  async revenue(businessId: string, from: Date, to: Date, format: string) {
    const group =
      format === 'daily'
        ? '%Y-%m-%d'
        : format === 'weekly'
          ? '%G-W%V'
          : '%Y-%m';
    return this.invoices
      .aggregate([
        {
          $match: {
            businessId: new Types.ObjectId(businessId),
            issueDate: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: group, date: '$issueDate' } },
            revenue: {
              $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, '$total', 0] },
            },
            invoices: { $sum: 1 },
            paid: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .exec();
  }

  async invoiceStatus(businessId: string, from: Date, to: Date) {
    return this.invoices
      .aggregate([
        {
          $match: {
            businessId: new Types.ObjectId(businessId),
            issueDate: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total: { $sum: '$total' },
          },
        },
      ])
      .exec();
  }

  async outstanding(businessId: string) {
    return this.invoices
      .find({ businessId, status: 'DRAFT' })
      .sort({ dueDate: 1 })
      .limit(100)
      .select('invoiceNumber customerName dueDate total status')
      .lean()
      .exec();
  }

  async topCustomers(businessId: string) {
    return this.invoices
      .aggregate([
        { $match: { businessId: new Types.ObjectId(businessId) } },
        {
          $group: {
            _id: '$customerId',
            customerName: { $first: '$customerName' },
            invoiceCount: { $sum: 1 },
            total: { $sum: '$total' },
            outstanding: {
              $sum: { $cond: [{ $eq: ['$status', 'DRAFT'] }, '$total', 0] },
            },
          },
        },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ])
      .exec();
  }
}
