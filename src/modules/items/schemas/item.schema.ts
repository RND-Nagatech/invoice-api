import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'items', timestamps: true })
export class Item {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  businessId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, trim: true, default: '' })
  description!: string;

  @Prop({ type: String, trim: true, default: 'unit' })
  unit!: string;

  @Prop({ type: Number, required: true, min: 0 })
  defaultPrice!: number;

  @Prop({ type: Number, required: true, min: 0, max: 100, default: 0 })
  tax!: number;

  @Prop({ type: String, trim: true, default: '' })
  category!: string;

  @Prop({ type: Boolean, default: true, index: true })
  active!: boolean;
}

export type ItemDocument = HydratedDocument<Item>;
export const ItemSchema = SchemaFactory.createForClass(Item);
ItemSchema.index({ businessId: 1, name: 1 });
