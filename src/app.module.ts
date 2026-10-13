import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnvironment } from './config/env.validation.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { CommercialModule } from './modules/invoices/commercial.module.js';
import { BusinessModule } from './modules/businesses/business.module.js';
import { ItemsModule } from './modules/items/items.module.js';
import { TemplatesModule } from './modules/templates/templates.module.js';
import { SyncModule } from './modules/sync/sync.module.js';
import { QuotationsModule } from './modules/quotations/quotations.module.js';
import { ReceiptsModule } from './modules/receipts/receipts.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { RemindersModule } from './modules/reminders/reminders.module.js';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        serverSelectionTimeoutMS: 5000,
        retryAttempts: 3,
        retryDelay: 1000,
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
        },
        prefix: 'invoicekilat',
      }),
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuthModule,
    CommercialModule,
    BusinessModule,
    ItemsModule,
    TemplatesModule,
    SyncModule,
    QuotationsModule,
    ReceiptsModule,
    ReportsModule,
    RemindersModule,
    SubscriptionsModule,
    AiModule,
    PaymentsModule,
    AnalyticsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
