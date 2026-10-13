import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AiVoiceUsage,
  type VoiceTrialRequest,
} from '../schemas/ai-voice-usage.schema.js';

type ConsumptionResult = 'ACCEPTED' | 'EXHAUSTED' | 'REQUEST_REUSED';

@Injectable()
export class AiVoiceUsageRepository {
  constructor(
    @InjectModel(AiVoiceUsage.name) private readonly usage: Model<AiVoiceUsage>,
  ) {}

  async used(businessId: string): Promise<number> {
    const row = await this.usage
      .findOne({ businessId })
      .maxTimeMS(5000)
      .lean()
      .exec();
    return row?.successfulDrafts ?? 0;
  }

  private async replay(
    businessId: string,
    request: VoiceTrialRequest,
  ): Promise<ConsumptionResult | null> {
    const row = await this.usage
      .findOne({ businessId, 'requests.requestId': request.requestId })
      .select('requests')
      .maxTimeMS(5000)
      .lean()
      .exec();
    const previous = row?.requests.find(
      (record) => record.requestId === request.requestId,
    );
    return previous
      ? previous.transcriptHash === request.transcriptHash
        ? 'ACCEPTED'
        : 'REQUEST_REUSED'
      : null;
  }

  async consume(
    businessId: string,
    limit: number,
    request?: VoiceTrialRequest,
  ): Promise<ConsumptionResult> {
    if (request) {
      const replay = await this.replay(businessId, request);
      if (replay) return replay;
    }
    if (limit <= 0) return 'EXHAUSTED';
    // Initialize once, then increment with a conditional atomic update.
    // Concurrent first requests can race on the unique index safely.
    try {
      await this.usage
        .updateOne(
          { businessId },
          {
            $setOnInsert: {
              businessId: new Types.ObjectId(businessId),
              successfulDrafts: 0,
            },
          },
          { upsert: true },
        )
        .maxTimeMS(5000)
        .exec();
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    const result = await this.usage
      .updateOne(
        {
          businessId,
          successfulDrafts: { $lt: limit },
          ...(request
            ? { 'requests.requestId': { $ne: request.requestId } }
            : {}),
        },
        {
          $inc: { successfulDrafts: 1 },
          ...(request ? { $push: { requests: request } } : {}),
        },
      )
      .maxTimeMS(5000)
      .exec();
    if (result.modifiedCount === 1) return 'ACCEPTED';
    return request
      ? ((await this.replay(businessId, request)) ?? 'EXHAUSTED')
      : 'EXHAUSTED';
  }
}
