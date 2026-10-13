import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'customers', timestamps: true })
export class Customer {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  businessId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: ['PERSON', 'COMPANY'], required: true })
  type!: 'PERSON' | 'COMPANY';

  @Prop({ type: String, trim: true, default: '' })
  companyName!: string;

  @Prop({ type: String, trim: true, default: '' })
  phone!: string;

  @Prop({ type: String, lowercase: true, trim: true, default: '' })
  email!: string;

  @Prop({ type: String, trim: true, default: '' })
  address!: string;

  @Prop({ type: String, trim: true, default: '' })
  city!: string;

  @Prop({ type: String, trim: true, default: '' })
  npwp!: string;

  @Prop({ type: Number, min: 0, max: 365, default: 7 })
  paymentTermsDays!: number;
}

export type CustomerDocument = HydratedDocument<Customer>;
export const CustomerSchema = SchemaFactory.createForClass(Customer);
CustomerSchema.index({ businessId: 1, name: 1 });
