import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ReceiptQueryDto } from '../dto/receipt.dto.js';
import {
  Receipt,
  ReceiptCounter,
  ReceiptDocument,
} from '../schemas/receipt.schema.js';

@Injectable()
export class ReceiptRepository {
  constructor(
    @InjectModel(Receipt.name) private readonly receipts: Model<Receipt>,
    @InjectModel(ReceiptCounter.name)
    private readonly counters: Model<ReceiptCounter>,
  ) {}
  async nextNumber(businessId: string, issuedAt: Date) {
    const period = `${issuedAt.getUTCFullYear()}${String(issuedAt.getUTCMonth() + 1).padStart(2, '0')}`;
    const counter = await this.counters
      .findOneAndUpdate(
        { businessId, period },
        { $inc: { sequence: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
    return `RCT-${period}-${String(counter.sequence).padStart(4, '0')}`;
  }
  async list(businessId: string, query: ReceiptQueryDto) {
    const filter: Record<string, unknown> = { businessId };
    if (query.search)
      filter.$or = [
        { receiptNumber: { $regex: query.search, $options: 'i' } },
        { customerName: { $regex: query.search, $options: 'i' } },
      ];
    const [rows, total] = await Promise.all([
      this.receipts
        .find(filter)
        .sort({ issuedAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.receipts.countDocuments(filter).exec(),
    ]);
    return { rows, total };
  }
  findById(businessId: string, id: string): Promise<ReceiptDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.receipts.findOne({ _id: id, businessId }).exec();
  }
  findByInvoiceId(
    businessId: string,
    invoiceId: string,
  ): Promise<ReceiptDocument | null> {
    if (!Types.ObjectId.isValid(invoiceId)) return Promise.resolve(null);
    return this.receipts.findOne({ businessId, invoiceId }).exec();
  }
  updateEmailStatus(
    businessId: string,
    id: string,
    emailStatus: string,
    emailError = '',
  ): Promise<ReceiptDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.receipts
      .findOneAndUpdate(
        { _id: id, businessId },
        {
          $set: {
            emailStatus,
            emailError,
            ...(emailStatus === 'SENT' ? { emailSentAt: new Date() } : {}),
          },
        },
        { new: true },
      )
      .exec();
  }
  create(input: Record<string, unknown>): Promise<ReceiptDocument> {
    return this.receipts.create(input);
  }
}
