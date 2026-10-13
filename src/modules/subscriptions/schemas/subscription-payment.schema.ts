import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';
@Schema({ collection: 'subscription_payments', timestamps: true })
export class SubscriptionPayment {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  businessId!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) userId!: Types.ObjectId;
  @Prop({ required: true }) reference!: string;
  @Prop({ required: true }) email!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) amount!: number;
  @Prop({ enum: ['demo', 'manual'], required: true }) mode!: 'demo' | 'manual';
  @Prop({
    enum: ['PENDING', 'AWAITING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
    default: 'PENDING',
  })
  status!: string;
  @Prop({ default: true }) open!: boolean;
  @Prop({ type: Buffer, select: false }) proof?: Buffer;
  @Prop() proofMime?: string;
  @Prop() submittedAt?: Date;
  @Prop() reviewedAt?: Date;
  @Prop({ default: '' }) reviewReason!: string;
  @Prop({ default: 'NOT_SENT' }) notificationStatus!: string;
  @Prop() emailNotifiedAt?: Date;
}
export type SubscriptionPaymentDocument = HydratedDocument<SubscriptionPayment>;
export const SubscriptionPaymentSchema =
  SchemaFactory.createForClass(SubscriptionPayment);
SubscriptionPaymentSchema.index({ reference: 1 }, { unique: true });
SubscriptionPaymentSchema.index(
  { businessId: 1 },
  {
    name: 'one_open_payment',
    unique: true,
    partialFilterExpression: { open: true },
  },
);

SubscriptionPaymentSchema.index({ businessId: 1, createdAt: -1 });
