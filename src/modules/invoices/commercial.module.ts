import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { CustomersController } from '../customers/customers.controller.js';
import { CustomersService } from '../customers/customers.service.js';
import { CustomerRepository } from '../customers/repository/customer.repository.js';
import {
  Customer,
  CustomerSchema,
} from '../customers/schemas/customer.schema.js';
import { DashboardController } from './dashboard.controller.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import { InvoiceRepository } from './repository/invoice.repository.js';
import {
  Invoice,
  InvoiceCounter,
  InvoiceCounterSchema,
  InvoiceSchema,
} from './schemas/invoice.schema.js';
import { TemplatesModule } from '../templates/templates.module.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import { PublicInvoicesController } from './public-invoices.controller.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';

@Module({
  imports: [
    AuthModule,
    TemplatesModule,
    SubscriptionsModule,
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: InvoiceCounter.name, schema: InvoiceCounterSchema },
    ]),
  ],
  controllers: [
    CustomersController,
    InvoicesController,
    DashboardController,
    PublicInvoicesController,
  ],
  providers: [
    CustomersService,
    InvoicesService,
    CustomerRepository,
    InvoiceRepository,
    InvoicePdfService,
  ],
  exports: [InvoicesService, InvoiceRepository, CustomerRepository],
})
export class CommercialModule {}
