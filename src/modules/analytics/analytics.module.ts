import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import {
  AnalyticsEvent,
  AnalyticsEventSchema,
} from './schemas/analytics-event.schema.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: AnalyticsEvent.name, schema: AnalyticsEventSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
