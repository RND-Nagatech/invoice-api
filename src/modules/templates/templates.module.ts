import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TemplatePurchase,
  TemplatePurchaseSchema,
} from './schemas/template-purchase.schema.js';
import { TemplatePurchaseRepository } from './repository/template-purchase.repository.js';
import { TemplateMarketplaceService } from './template-marketplace.service.js';

@Module({
  imports: [SubscriptionsModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: TemplatePurchase.name, schema: TemplatePurchaseSchema },
    ]),
  ],
  controllers: [TemplatesController],
  providers: [
    TemplatesService,
    TemplatePurchaseRepository,
    TemplateMarketplaceService,
  ],
  exports: [TemplatesService],
})
export class TemplatesModule {}
