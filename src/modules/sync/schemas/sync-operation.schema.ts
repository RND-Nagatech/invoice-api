import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'sync_operations', timestamps: true })
export class SyncOperation {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  businessId!: Types.ObjectId;
  @Prop({ type: String, required: true }) operationId!: string;
  @Prop({ type: String, required: true }) entity!: string;
  @Prop({ type: String, required: true }) action!: string;
  @Prop({ type: SchemaTypes.Mixed, required: true }) payload!: Record<
    string,
    unknown
  >;
  @Prop({
    type: String,
    enum: ['PENDING', 'APPLIED', 'FAILED'],
    default: 'PENDING',
  })
  status!: 'PENDING' | 'APPLIED' | 'FAILED';
  @Prop({ type: String, default: '' }) error!: string;
  @Prop({ type: String, default: '' }) resultId!: string;
}

export type SyncOperationDocument = HydratedDocument<SyncOperation>;
export const SyncOperationSchema = SchemaFactory.createForClass(SyncOperation);
SyncOperationSchema.index({ businessId: 1, operationId: 1 }, { unique: true });
