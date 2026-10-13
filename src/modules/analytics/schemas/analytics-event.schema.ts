import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'analytics_events', timestamps: true })
export class AnalyticsEvent {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  businessId!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
    index: true,
  })
  eventName!: string;
  @Prop({ type: SchemaTypes.Mixed, default: {} }) properties!: Record<
    string,
    unknown
  >;
  @Prop({ type: String, trim: true, default: '' }) sessionId!: string;
  @Prop({ type: Date, required: true }) occurredAt!: Date;
}

export type AnalyticsEventDocument = HydratedDocument<AnalyticsEvent>;
export const AnalyticsEventSchema =
  SchemaFactory.createForClass(AnalyticsEvent);
AnalyticsEventSchema.index({ businessId: 1, occurredAt: -1 });
