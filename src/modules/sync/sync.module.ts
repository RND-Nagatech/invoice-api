import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { CommercialModule } from '../invoices/commercial.module.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';
import { SyncRepository } from './repository/sync.repository.js';
import {
  SyncOperation,
  SyncOperationSchema,
} from './schemas/sync-operation.schema.js';

@Module({
  imports: [
    AuthModule,
    CommercialModule,
    MongooseModule.forFeature([
      { name: SyncOperation.name, schema: SyncOperationSchema },
    ]),
  ],
  controllers: [SyncController],
  providers: [SyncService, SyncRepository],
})
export class SyncModule {}
