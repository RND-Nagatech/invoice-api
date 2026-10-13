import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'payments', timestamps: true })
export class Payment {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  businessId!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  invoiceId!: Types.ObjectId;
  @Prop({ type: String, required: true, unique: true })
  providerReference!: string;
  @Prop({ type: String, required: true }) provider!: string;
  @Prop({ type: Number, required: true, min: 1 }) amount!: number;
  @Prop({
    type: String,
    enum: ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'EXPIRED'],
    default: 'PENDING',
  })
  status!: string;
  @Prop({ type: String, default: '' }) checkoutUrl!: string;
  @Prop({ type: String, default: '' }) failureReason!: string;
  @Prop({ type: String, default: '' }) webhookEventId!: string;
  @Prop({ type: Buffer, select: false }) proof?: Buffer;
  @Prop({ type: String, default: '' }) proofMime!: string;
  @Prop({ type: Date, default: null }) submittedAt!: Date | null;
  @Prop({ type: String, default: '' }) senderName!: string;
  @Prop({ type: String, default: '' }) note!: string;
  @Prop({ type: String, enum: ['OWNER', 'CUSTOMER'], default: 'OWNER' })
  source!: string;
}
export type PaymentDocument = HydratedDocument<Payment>;
export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ businessId: 1, createdAt: -1 });
