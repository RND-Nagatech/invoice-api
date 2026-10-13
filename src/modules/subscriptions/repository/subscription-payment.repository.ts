import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession } from 'mongoose';
import { NotFoundException } from '@nestjs/common';
import { SubscriptionPayment } from '../schemas/subscription-payment.schema.js';
@Injectable()
export class SubscriptionPaymentRepository {
  constructor(
    @InjectModel(SubscriptionPayment.name)
    readonly model: Model<SubscriptionPayment>,
  ) {}
  async open(businessId: string, input: Record<string, unknown>) {
    try {
      return await this.model
        .findOneAndUpdate(
          { businessId, open: true },
          { $setOnInsert: input },
          { returnDocument: 'after', upsert: true },
        )
        .exec();
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      return this.model.findOne({ businessId, open: true }).exec();
    }
  }
  latest(businessId: string) {
    return this.model.findOne({ businessId }).sort({ createdAt: -1 }).exec();
  }
  find(
    id: string,
    businessId?: string,
    proof = false,
    session?: ClientSession,
  ) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Pengajuan tidak ditemukan.');
    const query = this.model
      .findOne({ _id: id, ...(businessId ? { businessId } : {}) })
      .session(session ?? null);
    if (proof) query.select('+proof');
    return query.exec();
  }
  submit(id: string, businessId: string, proof: Buffer, proofMime: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Pengajuan tidak ditemukan.');
    return this.model
      .findOneAndUpdate(
        { _id: id, businessId, status: 'PENDING' },
        {
          $set: {
            status: 'AWAITING_REVIEW',
            proof,
            proofMime,
            submittedAt: new Date(),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
  }
  notify(id: string, status: string) {
    return this.model
      .updateOne(
        { _id: id },
        {
          $set: {
            notificationStatus: status,
            ...(status === 'SENT' ? { emailNotifiedAt: new Date() } : {}),
          },
        },
      )
      .exec();
  }
  cancel(id: string, businessId: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Pengajuan tidak ditemukan.');
    return this.model
      .findOneAndUpdate(
        { _id: id, businessId, status: 'PENDING' },
        { $set: { status: 'CANCELLED', open: false } },
        { returnDocument: 'after' },
      )
      .exec();
  }
  list() {
    return this.model.find().sort({ createdAt: -1 }).limit(100).exec();
  }
  decide(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    reason: string,
    session: ClientSession,
  ) {
    return this.model
      .findOneAndUpdate(
        { _id: id, status: 'AWAITING_REVIEW' },
        {
          $set: {
            status,
            open: false,
            reviewedAt: new Date(),
            reviewReason: reason,
          },
        },
        { returnDocument: 'after', session },
      )
      .exec();
  }
}
