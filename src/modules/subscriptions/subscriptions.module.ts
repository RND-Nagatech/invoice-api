import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { SubscriptionRepository } from './repository/subscription.repository.js';
import {
  Subscription,
  SubscriptionSchema,
} from './schemas/subscription.schema.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema.js';
import {
  Customer,
  CustomerSchema,
} from '../customers/schemas/customer.schema.js';
import {
  SubscriptionPayment,
  SubscriptionPaymentSchema,
} from './schemas/subscription-payment.schema.js';
import { SubscriptionPaymentRepository } from './repository/subscription-payment.repository.js';
import { BillingService } from './billing.service.js';
import { BillingAdminController } from './billing-admin.controller.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: SubscriptionPayment.name, schema: SubscriptionPaymentSchema },
    ]),
  ],
  controllers: [SubscriptionsController, BillingAdminController],
  providers: [
    SubscriptionsService,
    SubscriptionRepository,
    SubscriptionPaymentRepository,
    BillingService,
  ],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
