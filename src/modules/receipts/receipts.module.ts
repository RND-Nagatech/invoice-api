import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { CommercialModule } from '../invoices/commercial.module.js';
import { ReceiptRepository } from './repository/receipt.repository.js';
import {
  Receipt,
  ReceiptCounter,
  ReceiptCounterSchema,
  ReceiptSchema,
} from './schemas/receipt.schema.js';
import { ReceiptsController } from './receipts.controller.js';
import { ReceiptsService } from './receipts.service.js';

@Module({
  imports: [
    AuthModule,
    CommercialModule,
    MongooseModule.forFeature([
      { name: Receipt.name, schema: ReceiptSchema },
      { name: ReceiptCounter.name, schema: ReceiptCounterSchema },
    ]),
  ],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptRepository],
})
export class ReceiptsModule {}
