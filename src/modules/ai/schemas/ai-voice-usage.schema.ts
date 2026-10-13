import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class VoiceTrialRequest {
  @Prop({ type: String, required: true }) requestId!: string;
  @Prop({ type: String, required: true }) transcriptHash!: string;
}
const VoiceTrialRequestSchema = SchemaFactory.createForClass(VoiceTrialRequest);

@Schema({ collection: 'ai_voice_usage', timestamps: true })
export class AiVoiceUsage {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  businessId!: Types.ObjectId;

  @Prop({ type: Number, min: 0, default: 0 })
  successfulDrafts!: number;

  @Prop({ type: [VoiceTrialRequestSchema], default: [] })
  requests!: VoiceTrialRequest[];
}

export const AiVoiceUsageSchema = SchemaFactory.createForClass(AiVoiceUsage);
AiVoiceUsageSchema.index({ businessId: 1 }, { unique: true });
