import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payment, PaymentDocument } from '../schemas/payment.schema.js';

@Injectable()
export class PaymentRepository {
  constructor(
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
  ) {}
  list(businessId: string, invoiceId?: string) {
    return this.payments
      .find({ businessId, ...(invoiceId ? { invoiceId } : {}) })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
  }
  findById(businessId: string, id: string): Promise<PaymentDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.payments.findOne({ _id: id, businessId }).exec();
  }
  findByReference(reference: string): Promise<PaymentDocument | null> {
    return this.payments.findOne({ providerReference: reference }).exec();
  }
  findByWebhookEvent(eventId: string): Promise<PaymentDocument | null> {
    if (!eventId) return Promise.resolve(null);
    return this.payments.findOne({ webhookEventId: eventId }).exec();
  }
  create(input: Record<string, unknown>): Promise<PaymentDocument> {
    return this.payments.create(input);
  }
  findProof(businessId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.payments
      .findOne({ _id: id, businessId })
      .select('+proof')
      .exec();
  }
  claimManual(businessId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.payments
      .findOneAndUpdate(
        { _id: id, businessId, provider: 'MANUAL', status: 'PENDING' },
        { $set: { status: 'PROCESSING' } },
        { new: true },
      )
      .exec();
  }
  rejectManual(businessId: string, id: string, reason: string) {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.payments
      .findOneAndUpdate(
        { _id: id, businessId, provider: 'MANUAL', status: 'PENDING' },
        { $set: { status: 'FAILED', failureReason: reason } },
        { new: true },
      )
      .exec();
  }
  releaseManual(businessId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.payments
      .findOneAndUpdate(
        { _id: id, businessId, provider: 'MANUAL', status: 'PROCESSING' },
        { $set: { status: 'PENDING' } },
        { returnDocument: 'after' },
      )
      .exec();
  }
  updateStatus(
    reference: string,
    status: string,
    eventId = '',
    failureReason = '',
  ) {
    return this.payments
      .findOneAndUpdate(
        { providerReference: reference },
        { $set: { status, webhookEventId: eventId, failureReason } },
        { new: true },
      )
      .exec();
  }

  updateStatusById(
    businessId: string,
    id: string,
    status: string,
    failureReason = '',
  ) {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.payments
      .findOneAndUpdate(
        { _id: id, businessId },
        { $set: { status, failureReason } },
        { new: true },
      )
      .exec();
  }
}
