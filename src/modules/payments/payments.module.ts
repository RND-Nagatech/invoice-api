import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { CommercialModule } from '../invoices/commercial.module.js';
import { PaymentRepository } from './repository/payment.repository.js';
import { Payment, PaymentSchema } from './schemas/payment.schema.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PublicPaymentsController } from './public-payments.controller.js';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    CommercialModule,
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
  ],
  controllers: [PaymentsController, PublicPaymentsController],
  providers: [PaymentsService, PaymentRepository],
})
export class PaymentsModule {}
