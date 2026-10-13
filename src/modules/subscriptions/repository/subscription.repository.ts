import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession } from 'mongoose';
import { Invoice } from '../../invoices/schemas/invoice.schema.js';
import { Customer } from '../../customers/schemas/customer.schema.js';
import {
  Subscription,
  type SubscriptionDocument,
} from '../schemas/subscription.schema.js';

@Injectable()
export class SubscriptionRepository {
  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptions: Model<Subscription>,
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
  ) {}
  findByBusinessId(
    businessId: string,
    session?: ClientSession,
  ): Promise<SubscriptionDocument | null> {
    return this.subscriptions
      .findOne({ businessId })
      .session(session ?? null)
      .exec();
  }
  async ensure(businessId: string): Promise<SubscriptionDocument> {
    let row = await this.findByBusinessId(businessId);
    if (!row) {
      try {
        row = await this.subscriptions
          .findOneAndUpdate(
            { businessId },
            {
              $setOnInsert: {
                businessId: new Types.ObjectId(businessId),
                planId: 'FREE',
                status: 'ACTIVE',
                periodStart: new Date(),
                periodEnd: new Date(),
                usageInitialized: false,
              },
            },
            { upsert: true, returnDocument: 'after' },
          )
          .exec();
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        row = await this.findByBusinessId(businessId);
      }
    }
    if (!row) throw new Error('Cannot initialize subscription');
    if (!row.usageInitialized) {
      const [invoiceCount, customerCount] = await Promise.all([
        this.invoices.countDocuments({ businessId }).exec(),
        this.customers.countDocuments({ businessId }).exec(),
      ]);
      await this.subscriptions
        .updateOne(
          { businessId, usageInitialized: { $ne: true } },
          {
            $max: { invoiceCount, customerCount },
            $set: { usageInitialized: true },
          },
        )
        .exec();
      row = (await this.findByBusinessId(businessId))!;
    }
    return row;
  }
  reserve(
    businessId: string,
    kind: 'invoice' | 'customer',
    mode: 'demo' | 'manual',
  ) {
    const field = kind === 'invoice' ? 'invoiceCount' : 'customerCount';
    return this.subscriptions
      .findOneAndUpdate(
        {
          businessId,
          $or: [
            {
              planId: 'PRO',
              billingMode: mode,
              status: 'ACTIVE',
              periodEnd: { $gt: new Date() },
            },
            { [field]: { $lt: kind === 'invoice' ? 10 : 20 } },
          ],
        },
        { $inc: { [field]: 1 } },
        { returnDocument: 'after' },
      )
      .exec();
  }
  release(businessId: string, kind: 'invoice' | 'customer') {
    const field = kind === 'invoice' ? 'invoiceCount' : 'customerCount';
    return this.subscriptions
      .updateOne({ businessId, [field]: { $gt: 0 } }, { $inc: { [field]: -1 } })
      .exec();
  }
  activate(
    businessId: string,
    periodStart: Date,
    periodEnd: Date,
    session: ClientSession,
    billingMode: 'demo' | 'manual',
  ) {
    return this.subscriptions
      .updateOne(
        { businessId },
        {
          $set: {
            planId: 'PRO',
            status: 'ACTIVE',
            periodStart,
            periodEnd,
            billingMode,
          },
        },
        { session },
      )
      .exec();
  }
}
