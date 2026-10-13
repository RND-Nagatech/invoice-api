import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import {
  Customer,
  CustomerSchema,
} from '../customers/schemas/customer.schema.js';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema.js';
import { Item, ItemSchema } from '../items/schemas/item.schema.js';
import {
  AiVoiceUsage,
  AiVoiceUsageSchema,
} from './schemas/ai-voice-usage.schema.js';
import { AiDraftContextRepository } from './repository/ai-draft-context.repository.js';
import { AiVoiceUsageRepository } from './repository/ai-voice-usage.repository.js';

@Module({
  imports: [
    SubscriptionsModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Item.name, schema: ItemSchema },
      { name: AiVoiceUsage.name, schema: AiVoiceUsageSchema },
    ]),
  ],
  controllers: [AiController],
  providers: [AiService, AiDraftContextRepository, AiVoiceUsageRepository],
  exports: [AiService],
})
export class AiModule {}
