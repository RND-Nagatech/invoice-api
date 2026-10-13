import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'reminders', timestamps: true })
export class Reminder {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  businessId!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  invoiceId!: Types.ObjectId;
  @Prop({ type: Date, required: true, index: true }) remindAt!: Date;
  @Prop({ type: String, enum: ['EMAIL', 'PUSH'], default: 'PUSH' }) channel!:
    'EMAIL' | 'PUSH';
  @Prop({
    type: String,
    enum: ['SCHEDULED', 'SENT', 'CANCELLED', 'FAILED'],
    default: 'SCHEDULED',
  })
  status!: 'SCHEDULED' | 'SENT' | 'CANCELLED' | 'FAILED';
  @Prop({ type: Date, default: null }) sentAt!: Date | null;
  @Prop({ type: String, default: '' }) message!: string;
}
export type ReminderDocument = HydratedDocument<Reminder>;
export const ReminderSchema = SchemaFactory.createForClass(Reminder);
ReminderSchema.index(
  { businessId: 1, invoiceId: 1, remindAt: 1 },
  { unique: true },
);
