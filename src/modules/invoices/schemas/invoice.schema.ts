import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class InvoiceItem {
  @Prop({ type: String, required: true, trim: true }) name!: string;
  @Prop({ type: String, default: '' }) description!: string;
  @Prop({ type: Number, required: true, min: 1 }) quantity!: number;
  @Prop({ type: String, default: 'unit' }) unit!: string;
  @Prop({ type: Number, required: true, min: 0 }) unitPrice!: number;
  @Prop({ type: Number, required: true, min: 0 }) lineTotal!: number;
}

export const InvoiceItemSchema = SchemaFactory.createForClass(InvoiceItem);

export const INVOICE_STATUSES = [
  'DRAFT',
  'SENT',
  'VIEWED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'VOID',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

@Schema({ _id: false })
export class ServiceRecord {
  @Prop({ type: String, default: '' }) serialNumber!: string;
  @Prop({ type: String, default: '' }) workSummary!: string;
  @Prop({ type: Date, default: null }) warrantyStartsAt!: Date | null;
  @Prop({ type: Date, default: null }) warrantyUntil!: Date | null;
  @Prop({ type: Date, default: null }) nextServiceAt!: Date | null;
  @Prop({ type: [String], default: [], select: false }) photos!: string[];
  @Prop({ type: Number, default: 0 }) photoCount!: number;
}
export const ServiceRecordSchema = SchemaFactory.createForClass(ServiceRecord);

@Schema({
  collection: 'invoices',
  timestamps: true,
  optimisticConcurrency: true,
})
export class Invoice {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  businessId!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  customerId!: Types.ObjectId;
  @Prop({ type: String, required: true }) customerName!: string;
  @Prop({ type: String, required: true }) invoiceNumber!: string;
  @Prop({ type: String, index: true, unique: true, sparse: true })
  publicId?: string;
  @Prop({ type: String, trim: true, default: 'modern-purple' })
  templateId!: string;
  @Prop({ type: Boolean, default: true })
  showPageNumber!: boolean;
  @Prop({ type: Date, required: true }) issueDate!: Date;
  @Prop({ type: Date, required: true }) dueDate!: Date;
  @Prop({
    type: String,
    enum: INVOICE_STATUSES.filter((status) => status !== 'OVERDUE'),
    default: 'DRAFT',
  })
  status!: Exclude<InvoiceStatus, 'OVERDUE'>;
  @Prop({ type: [InvoiceItemSchema], required: true }) items!: InvoiceItem[];
  @Prop({ type: Number, required: true, min: 0 }) subtotal!: number;
  @Prop({ type: Number, required: true, min: 0 }) discount!: number;
  @Prop({ type: Number, required: true, min: 0 }) taxPercent!: number;
  @Prop({ type: Number, required: true, min: 0 }) tax!: number;
  @Prop({ type: Number, required: true, min: 0 }) additionalFee!: number;
  @Prop({ type: Number, required: true, min: 0 }) total!: number;
  @Prop({ type: String, default: '' }) notes!: string;
  @Prop({ type: Date, default: null }) paidAt!: Date | null;
  @Prop({ type: Number, min: 0, default: 0 }) paidAmount!: number;
  // Applied references make confirmations safe to retry without counting twice.
  @Prop({ type: [String], default: [] }) appliedPaymentReferences!: string[];
  @Prop({ type: Number, min: 0, default: 0 }) version!: number;
  @Prop({ type: ServiceRecordSchema, default: null })
  serviceRecord!: ServiceRecord | null;
  @Prop({ type: Date, default: null }) promisedPaymentDate!: Date | null;
  @Prop({ type: String, default: '' }) promiseNote!: string;
  @Prop({ type: Date, default: null }) promiseCreatedAt!: Date | null;
  @Prop({ type: Date, default: null }) repeatRequestedAt!: Date | null;
  @Prop({ type: String, default: '' }) repeatMessage!: string;
  @Prop({ type: String, enum: ['', 'OPEN', 'RESOLVED'], default: '' })
  repeatRequestStatus!: string;
  @Prop({ type: Date, default: null }) lastCustomerActivityAt!: Date | null;
  @Prop({ type: Date, default: null }) activitySeenAt!: Date | null;
}

export type InvoiceDocument = HydratedDocument<Invoice>;
export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.index({ businessId: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ businessId: 1, createdAt: -1 });
InvoiceSchema.index({ businessId: 1, status: 1, issueDate: 1 });

@Schema({ collection: 'invoice_counters' })
export class InvoiceCounter {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  businessId!: Types.ObjectId;
  @Prop({ type: String, required: true }) period!: string;
  @Prop({ type: Number, required: true }) sequence!: number;
}

export const InvoiceCounterSchema =
  SchemaFactory.createForClass(InvoiceCounter);
InvoiceCounterSchema.index({ businessId: 1, period: 1 }, { unique: true });
