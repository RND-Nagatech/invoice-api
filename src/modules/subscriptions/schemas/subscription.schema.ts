import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'subscriptions', timestamps: true })
export class Subscription {
  @Prop({
    type: SchemaTypes.ObjectId,
    required: true,
    unique: true,
    index: true,
  })
  businessId!: Types.ObjectId;
  @Prop({ type: String, default: 'FREE' }) planId!: string;
  @Prop({
    type: String,
    enum: ['ACTIVE', 'PAST_DUE', 'CANCELLED'],
    default: 'ACTIVE',
  })
  status!: string;
  @Prop({ type: Date, required: true }) periodStart!: Date;
  @Prop({ type: Date, required: true }) periodEnd!: Date;
  @Prop({ type: Number, default: 0 }) invoiceCount!: number;
  @Prop({ type: Number, default: 0 }) customerCount!: number;
  @Prop({ type: Boolean, default: false }) usageInitialized!: boolean;
  @Prop({ type: String, enum: ['demo', 'manual'], default: null })
  billingMode!: 'demo' | 'manual' | null;
}
export type SubscriptionDocument = HydratedDocument<Subscription>;
export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
