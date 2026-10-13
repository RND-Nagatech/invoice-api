import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema.js';
import { ReportsController } from './reports.controller.js';
import { ReportsRepository } from './repository/reports.repository.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [SubscriptionsModule,
    AuthModule,
    MongooseModule.forFeature([{ name: Invoice.name, schema: InvoiceSchema }]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
})
export class ReportsModule {}
