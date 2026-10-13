import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class QuotationItem {
  @Prop({ type: String, required: true, trim: true }) name!: string;
  @Prop({ type: String, default: '' }) description!: string;
  @Prop({ type: Number, required: true, min: 1 }) quantity!: number;
  @Prop({ type: String, default: 'unit' }) unit!: string;
  @Prop({ type: Number, required: true, min: 0 }) unitPrice!: number;
  @Prop({ type: Number, required: true, min: 0 }) lineTotal!: number;
}
export const QuotationItemSchema = SchemaFactory.createForClass(QuotationItem);

@Schema({
  collection: 'quotations',
  timestamps: true,
  optimisticConcurrency: true,
})
export class Quotation {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  businessId!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  customerId!: Types.ObjectId;
  @Prop({ type: String, required: true }) customerName!: string;
  @Prop({ type: String, required: true }) quotationNumber!: string;
  @Prop({ type: Date, required: true }) issueDate!: Date;
  @Prop({ type: Date, required: true }) validUntil!: Date;
  @Prop({
    type: String,
    enum: ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED'],
    default: 'DRAFT',
  })
  status!: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED';
  @Prop({ type: [QuotationItemSchema], required: true })
  items!: QuotationItem[];
  @Prop({ type: Number, required: true, min: 0 }) subtotal!: number;
  @Prop({ type: Number, required: true, min: 0 }) discount!: number;
  @Prop({ type: Number, required: true, min: 0 }) taxPercent!: number;
  @Prop({ type: Number, required: true, min: 0 }) tax!: number;
  @Prop({ type: Number, required: true, min: 0 }) total!: number;
  @Prop({ type: String, default: '' }) notes!: string;
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  invoiceId!: Types.ObjectId | null;
}
export type QuotationDocument = HydratedDocument<Quotation>;
export type QuotationStatus = Quotation['status'];
export const QuotationSchema = SchemaFactory.createForClass(Quotation);
QuotationSchema.index({ businessId: 1, quotationNumber: 1 }, { unique: true });

@Schema({ collection: 'quotation_counters' })
export class QuotationCounter {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  businessId!: Types.ObjectId;
  @Prop({ type: String, required: true }) period!: string;
  @Prop({ type: Number, required: true }) sequence!: number;
}
export const QuotationCounterSchema =
  SchemaFactory.createForClass(QuotationCounter);
QuotationCounterSchema.index({ businessId: 1, period: 1 }, { unique: true });
