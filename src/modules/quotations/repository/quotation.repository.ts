import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { QuotationQueryDto } from '../dto/quotation.dto.js';
import {
  Quotation,
  QuotationCounter,
  QuotationDocument,
  QuotationStatus,
} from '../schemas/quotation.schema.js';

@Injectable()
export class QuotationRepository {
  constructor(
    @InjectModel(Quotation.name) private readonly quotations: Model<Quotation>,
    @InjectModel(QuotationCounter.name)
    private readonly counters: Model<QuotationCounter>,
  ) {}

  async nextNumber(businessId: string, issueDate: Date) {
    const period = `${issueDate.getUTCFullYear()}${String(issueDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const counter = await this.counters
      .findOneAndUpdate(
        { businessId, period },
        { $inc: { sequence: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
    return `QUO-${period}-${String(counter.sequence).padStart(4, '0')}`;
  }

  async list(businessId: string, query: QuotationQueryDto) {
    const filter: Record<string, unknown> = { businessId };
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { quotationNumber: { $regex: escaped, $options: 'i' } },
        { customerName: { $regex: escaped, $options: 'i' } },
      ];
    }
    if (query.status && query.status !== 'ALL') filter.status = query.status;
    const [rows, total] = await Promise.all([
      this.quotations
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.quotations.countDocuments(filter).exec(),
    ]);
    return { rows, total };
  }
  findById(businessId: string, id: string): Promise<QuotationDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.quotations.findOne({ _id: id, businessId }).exec();
  }
  create(input: Record<string, unknown>): Promise<QuotationDocument> {
    return this.quotations.create(input);
  }
  updateDraft(businessId: string, id: string, input: Record<string, unknown>) {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.quotations
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
    from: QuotationStatus,
    status: QuotationStatus,
    extra: Record<string, unknown> = {},
  ) {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.quotations
      .findOneAndUpdate(
        { _id: id, businessId, status: from },
        { $set: { status, ...extra } },
        { new: true },
      )
      .exec();
  }
  async deleteDraft(businessId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) return false;
    return (
      (
        await this.quotations
          .deleteOne({ _id: id, businessId, status: 'DRAFT' })
          .exec()
      ).deletedCount === 1
    );
  }
}
