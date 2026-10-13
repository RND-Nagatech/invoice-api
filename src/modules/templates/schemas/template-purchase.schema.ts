import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'template_purchases', timestamps: true })
export class TemplatePurchase {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  businessId!: Types.ObjectId;
  @Prop({ type: String, required: true }) templateId!: string;
  @Prop({ type: Number, required: true }) version!: number;
  @Prop({ type: Date, required: true }) purchasedAt!: Date;
}
export type TemplatePurchaseDocument = HydratedDocument<TemplatePurchase>;
export const TemplatePurchaseSchema =
  SchemaFactory.createForClass(TemplatePurchase);
TemplatePurchaseSchema.index(
  { businessId: 1, templateId: 1 },
  { unique: true },
);
