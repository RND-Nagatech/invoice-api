import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { InvoiceQueryDto } from '../dto/invoice.dto.js';
import {
  Invoice,
  InvoiceCounter,
  InvoiceDocument,
  type InvoiceStatus,
} from '../schemas/invoice.schema.js';

@Injectable()
export class InvoiceRepository {
  constructor(
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    @InjectModel(InvoiceCounter.name)
    private readonly counters: Model<InvoiceCounter>,
  ) {}

  private startOfToday(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  async nextNumber(businessId: string, issueDate: Date): Promise<string> {
    const period = `${issueDate.getUTCFullYear()}${String(issueDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const counter = await this.counters
      .findOneAndUpdate(
        { businessId, period },
        { $inc: { sequence: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
    return `INV-${period}-${String(counter.sequence).padStart(4, '0')}`;
  }

  async list(businessId: string, query: InvoiceQueryDto) {
    const filter: Record<string, unknown> = { businessId };
    if (query.customerId) filter.customerId = query.customerId;
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { invoiceNumber: { $regex: escaped, $options: 'i' } },
        { customerName: { $regex: escaped, $options: 'i' } },
        { 'items.name': { $regex: escaped, $options: 'i' } },
        { 'items.description': { $regex: escaped, $options: 'i' } },
        { notes: { $regex: escaped, $options: 'i' } },
      ];
    }
    if (query.status && !['ALL', 'OVERDUE', 'UNPAID'].includes(query.status))
      filter.status = query.status;
    if (query.status === 'UNPAID')
      filter.status = { $in: ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID'] };
    if (query.status === 'OVERDUE') {
      filter.status = { $in: ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID'] };
      filter.dueDate = { $lt: this.startOfToday() };
    }
    const sort = {
      DATE_DESC: { issueDate: -1, _id: -1 },
      DATE_ASC: { issueDate: 1, _id: 1 },
      TOTAL_DESC: { total: -1, issueDate: -1, _id: -1 },
      TOTAL_ASC: { total: 1, issueDate: 1, _id: 1 },
    }[query.sort ?? 'DATE_DESC'] as Record<string, 1 | -1>;
    const [rows, total] = await Promise.all([
      this.invoices
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.invoices.countDocuments(filter).exec(),
    ]);
    return { rows, total };
  }

  async listForCustomer(
    businessId: string,
    customerId: string,
    page: number,
    limit: number,
  ) {
    const filter = { businessId, customerId };
    const [rows, total] = await Promise.all([
      this.invoices
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.invoices.countDocuments(filter).exec(),
    ]);
    return { rows, total };
  }

  findById(businessId: string, id: string, includeServicePhotos = false): Promise<InvoiceDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.invoices.findOne({ _id: id, businessId }).select(includeServicePhotos ? '+serviceRecord.photos' : '').exec();
  }

  findByPublicId(publicId: string, includeServicePhotos = false): Promise<InvoiceDocument | null> {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(publicId)) return Promise.resolve(null);
    return this.invoices.findOne({ publicId }).select(includeServicePhotos ? '+serviceRecord.photos' : '').exec();
  }

  ensurePublicId(
    id: string,
    publicId: string,
  ): Promise<InvoiceDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.invoices
      .findOneAndUpdate(
        { _id: id, $or: [{ publicId: { $exists: false } }, { publicId: '' }] },
        { $set: { publicId } },
        { new: true, runValidators: true },
      )
      .exec();
  }

  create(input: Record<string, unknown>): Promise<InvoiceDocument> {
    return this.invoices.create(input);
  }

  updateExperience(
    businessId: string,
    id: string,
    input: Record<string, unknown>,
  ) {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.invoices
      .findOneAndUpdate(
        { _id: id, businessId, status: { $nin: ['CANCELLED', 'VOID'] } },
        { $set: input },
        { new: true, runValidators: true },
      )
      .exec();
  }

  publicExperience(
    publicId: string,
    input: Record<string, unknown>,
    unpaidOnly = false,
  ) {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(publicId)) return Promise.resolve(null);
    return this.invoices
      .findOneAndUpdate(
        {
          publicId,
          status: {
            $nin: unpaidOnly
              ? ['CANCELLED', 'VOID', 'PAID']
              : ['CANCELLED', 'VOID'],
          },
        },
        { $set: { ...input, lastCustomerActivityAt: new Date() } },
        { new: true, runValidators: true },
      )
      .exec();
  }

  acknowledgeActivity(businessId: string, id: string, seenAt: Date) {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.invoices
      .findOneAndUpdate(
        { _id: id, businessId, lastCustomerActivityAt: seenAt },
        { $set: { activitySeenAt: seenAt, repeatRequestStatus: 'RESOLVED' } },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
  }

  customerActivity(businessId: string) {
    return this.invoices
      .find({
        businessId,
        $or: [
          { lastCustomerActivityAt: { $ne: null } },
          { 'serviceRecord.nextServiceAt': { $ne: null } },
        ],
      })
      .sort({ lastCustomerActivityAt: -1, _id: -1 })
      .limit(100)
      .exec();
  }

  updateDraft(
    businessId: string,
    id: string,
    input: Record<string, unknown>,
  ): Promise<InvoiceDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.invoices
      .findOneAndUpdate(
        { _id: id, businessId, status: 'DRAFT' },
        { $set: input },
        { new: true, runValidators: true },
      )
      .exec();
  }

  transition(
    businessId: string,
    id: string,
    status: InvoiceStatus,
    paidAmount?: number,
  ) {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.invoices
      .findOneAndUpdate(
        { _id: id, businessId, status: { $nin: ['CANCELLED', 'VOID'] } },
        {
          $set: {
            status,
            paidAt: status === 'PAID' ? new Date() : null,
            ...(paidAmount === undefined ? {} : { paidAmount }),
          },
          $inc: { version: 1 },
        },
        { new: true },
      )
      .exec();
  }

  async applyPayment(
    businessId: string,
    id: string,
    reference: string,
    amount: number,
  ) {
    if (
      !Types.ObjectId.isValid(id) ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    )
      return null;
    const paidAmount = { $add: [{ $ifNull: ['$paidAmount', 0] }, amount] };
    const row = await this.invoices
      .findOneAndUpdate(
        {
          _id: id,
          businessId,
          status: { $in: ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID'] },
          appliedPaymentReferences: { $ne: reference },
          $expr: { $lte: [paidAmount, '$total'] },
        },
        [
          {
            $set: {
              paidAmount,
              appliedPaymentReferences: {
                $concatArrays: [
                  { $ifNull: ['$appliedPaymentReferences', []] },
                  [reference],
                ],
              },
              version: { $add: [{ $ifNull: ['$version', 0] }, 1] },
            },
          },
          {
            $set: {
              status: {
                $cond: [
                  { $eq: ['$paidAmount', '$total'] },
                  'PAID',
                  'PARTIALLY_PAID',
                ],
              },
              paidAt: {
                $cond: [{ $eq: ['$paidAmount', '$total'] }, '$$NOW', null],
              },
            },
          },
        ],
        { new: true, updatePipeline: true },
      )
      .exec();
    if (row) return row;
    const existing = await this.findById(businessId, id);
    return existing?.appliedPaymentReferences?.includes(reference)
      ? existing
      : null;
  }

  async deleteDraft(businessId: string, id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.invoices
      .deleteOne({ _id: id, businessId, status: 'DRAFT' })
      .exec();
    return result.deletedCount === 1;
  }

  async existsForCustomer(
    businessId: string,
    customerId: string,
  ): Promise<boolean> {
    const found = await this.invoices.exists({ businessId, customerId });
    return found !== null;
  }

  async revenue(
    businessId: string,
    currentFrom: Date,
    currentTo: Date,
    previousFrom: Date,
    previousTo: Date,
  ) {
    const [result] = await this.invoices
      .aggregate<{
        current: Array<{ total: number }>;
        previous: Array<{ total: number }>;
      }>([
        {
          $match: {
            businessId: new Types.ObjectId(businessId),
            status: 'PAID',
            issueDate: { $gte: previousFrom, $lt: currentTo },
          },
        },
        {
          $facet: {
            current: [
              {
                $match: {
                  issueDate: { $gte: currentFrom, $lt: currentTo },
                },
              },
              { $group: { _id: null, total: { $sum: '$total' } } },
            ],
            previous: [
              {
                $match: {
                  issueDate: { $gte: previousFrom, $lt: previousTo },
                },
              },
              { $group: { _id: null, total: { $sum: '$total' } } },
            ],
          },
        },
      ])
      .exec();

    return {
      current: result?.current[0]?.total ?? 0,
      previous: result?.previous[0]?.total ?? 0,
    };
  }

  async summary(businessId: string, customerId?: string) {
    const match: Record<string, unknown> = {
      businessId: new Types.ObjectId(businessId),
    };
    if (customerId) match.customerId = new Types.ObjectId(customerId);
    const [result] = await this.invoices
      .aggregate<{
        totalInvoices: number;
        totalRevenue: number;
        outstanding: number;
        overdueAmount: number;
        paidInvoiceCount: number;
        unpaidInvoiceCount: number;
        overdueCount: number;
      }>([
        { $match: match },
        {
          $group: {
            _id: null,
            totalInvoices: { $sum: 1 },
            totalRevenue: {
              $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, '$total', 0] },
            },
            outstanding: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID'],
                    ],
                  },
                  { $subtract: ['$total', { $ifNull: ['$paidAmount', 0] }] },
                  0,
                ],
              },
            },
            paidInvoiceCount: {
              $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, 1, 0] },
            },
            unpaidInvoiceCount: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID'],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            overdueCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {
                        $in: [
                          '$status',
                          ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID'],
                        ],
                      },
                      { $lt: ['$dueDate', this.startOfToday()] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            overdueAmount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {
                        $in: [
                          '$status',
                          ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID'],
                        ],
                      },
                      { $lt: ['$dueDate', this.startOfToday()] },
                    ],
                  },
                  { $subtract: ['$total', { $ifNull: ['$paidAmount', 0] }] },
                  0,
                ],
              },
            },
          },
        },
      ])
      .exec();
    return (
      result ?? {
        totalInvoices: 0,
        totalRevenue: 0,
        outstanding: 0,
        overdueAmount: 0,
        paidInvoiceCount: 0,
        unpaidInvoiceCount: 0,
        overdueCount: 0,
      }
    );
  }
}
