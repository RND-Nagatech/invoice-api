import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'receipts', timestamps: true })
export class Receipt {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  businessId!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  invoiceId!: Types.ObjectId;
  @Prop({ type: String, required: true }) receiptNumber!: string;
  @Prop({ type: String, required: true }) customerName!: string;
  @Prop({ type: Number, required: true, min: 1 }) amount!: number;
  @Prop({ type: Date, required: true }) issuedAt!: Date;
  @Prop({ type: String, default: '' }) paymentMethod!: string;
  @Prop({ type: String, default: '' }) notes!: string;
  @Prop({
    type: String,
    enum: ['NOT_SENT', 'SENT', 'FAILED'],
    default: 'NOT_SENT',
  })
  emailStatus!: 'NOT_SENT' | 'SENT' | 'FAILED';
  @Prop({ type: Date, default: null }) emailSentAt!: Date | null;
  @Prop({ type: String, default: '' }) emailError!: string;
}
export type ReceiptDocument = HydratedDocument<Receipt>;
export const ReceiptSchema = SchemaFactory.createForClass(Receipt);
ReceiptSchema.index({ businessId: 1, receiptNumber: 1 }, { unique: true });
ReceiptSchema.index(
  { businessId: 1, invoiceId: 1 },
  { unique: true, name: 'one_receipt_per_invoice' },
);

@Schema({ collection: 'receipt_counters' })
export class ReceiptCounter {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  businessId!: Types.ObjectId;
  @Prop({ type: String, required: true }) period!: string;
  @Prop({ type: Number, required: true }) sequence!: number;
}
export const ReceiptCounterSchema =
  SchemaFactory.createForClass(ReceiptCounter);
ReceiptCounterSchema.index({ businessId: 1, period: 1 }, { unique: true });
