import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
  })
  email!: string;

  @Prop({ type: String, required: true, select: false })
  passwordHash!: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  businessId!: Types.ObjectId;

  @Prop({ type: String, enum: ['owner'], default: 'owner' })
  role!: 'owner';
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
