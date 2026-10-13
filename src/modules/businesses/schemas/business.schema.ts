import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'businesses', timestamps: true })
export class Business {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ type: String, trim: true, default: '' })
  logo!: string;

  @Prop({ type: String, trim: true, default: '' })
  address!: string;

  @Prop({ type: String, trim: true, default: '' })
  phone!: string;

  @Prop({ type: String, lowercase: true, trim: true, default: '' })
  email!: string;

  @Prop({ type: String, trim: true, default: '' })
  website!: string;

  @Prop({ type: String, trim: true, default: '' })
  npwp!: string;

  @Prop({ type: String, trim: true, default: '' })
  qris!: string;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  bankAccounts!: Array<Record<string, string>>;

  @Prop({ type: String, trim: true, default: 'modern-purple' })
  defaultTemplate!: string;

  @Prop({ type: Number, min: 0, max: 365, default: 7 })
  defaultDueDate!: number;

  @Prop({ type: String, trim: true, default: '' })
  defaultFooter!: string;

  @Prop({ type: String, trim: true, default: '#5B2EFF' })
  brandColor!: string;

  @Prop({ type: String, trim: true, default: '#EDE8FF' })
  secondaryColor!: string;

  @Prop({ type: String, trim: true, default: 'Inter' })
  fontPreset!: string;
}

export type BusinessDocument = HydratedDocument<Business>;
export const BusinessSchema = SchemaFactory.createForClass(Business);
