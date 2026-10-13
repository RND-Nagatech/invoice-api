import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import {
  Customer,
  CustomerSchema,
} from '../customers/schemas/customer.schema.js';
import { CommercialModule } from '../invoices/commercial.module.js';
import { QuotationRepository } from './repository/quotation.repository.js';
import {
  Quotation,
  QuotationCounter,
  QuotationCounterSchema,
  QuotationSchema,
} from './schemas/quotation.schema.js';
import { QuotationsController } from './quotations.controller.js';
import { QuotationsService } from './quotations.service.js';

@Module({
  imports: [
    AuthModule,
    CommercialModule,
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: Quotation.name, schema: QuotationSchema },
      { name: QuotationCounter.name, schema: QuotationCounterSchema },
    ]),
  ],
  controllers: [QuotationsController],
  providers: [QuotationsService, QuotationRepository],
})
export class QuotationsModule {}
