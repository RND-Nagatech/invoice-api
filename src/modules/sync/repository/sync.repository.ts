import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SyncOperation,
  SyncOperationDocument,
} from '../schemas/sync-operation.schema.js';

@Injectable()
export class SyncRepository {
  constructor(
    @InjectModel(SyncOperation.name)
    private readonly operations: Model<SyncOperation>,
  ) {}

  findByOperationId(
    businessId: string,
    operationId: string,
  ): Promise<SyncOperationDocument | null> {
    return this.operations.findOne({ businessId, operationId }).exec();
  }

  create(input: Record<string, unknown>): Promise<SyncOperationDocument> {
    return this.operations.create(input);
  }

  list(businessId: string) {
    return this.operations
      .find({ businessId })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
  }
}
