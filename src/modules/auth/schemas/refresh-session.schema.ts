import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'refresh_sessions', timestamps: true })
export class RefreshSession {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  businessId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  tokenHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;
}

export type RefreshSessionDocument = HydratedDocument<RefreshSession>;
export const RefreshSessionSchema =
  SchemaFactory.createForClass(RefreshSession);
RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
