import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import type { AnalyticsEventDto } from './dto/analytics-event.dto.js';
import { AnalyticsEvent } from './schemas/analytics-event.schema.js';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(AnalyticsEvent.name)
    private readonly events: Model<AnalyticsEvent>,
  ) {}

  async record(user: AuthenticatedPrincipal, dto: AnalyticsEventDto) {
    await this.events.create({
      businessId: new Types.ObjectId(user.businessId),
      userId: new Types.ObjectId(user.id),
      eventName: dto.eventName,
      properties: dto.properties ?? {},
      sessionId: dto.sessionId ?? '',
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
    });
    return { accepted: true };
  }
}
