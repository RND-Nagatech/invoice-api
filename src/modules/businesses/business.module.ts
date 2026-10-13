import { TemplatesModule } from '../templates/templates.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessController } from './business.controller.js';
import { BusinessService } from './business.service.js';
import { BusinessRepository } from './repository/business.repository.js';
import { Business, BusinessSchema } from './schemas/business.schema.js';

@Module({
  imports: [
    TemplatesModule,
    SubscriptionsModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: Business.name, schema: BusinessSchema },
    ]),
  ],
  controllers: [BusinessController],
  providers: [BusinessService, BusinessRepository],
})
export class BusinessModule {}
