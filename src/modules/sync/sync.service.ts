import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import type {
  CreateInvoiceDto,
  UpdateInvoiceDto,
} from '../invoices/dto/invoice.dto.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import type { PushSyncDto } from './dto/sync.dto.js';
import { SyncRepository } from './repository/sync.repository.js';

@Injectable()
export class SyncService {
  constructor(
    private readonly operations: SyncRepository,
    private readonly invoices: InvoicesService,
  ) {}

  async push(user: AuthenticatedPrincipal, dto: PushSyncDto) {
    const existing = await this.operations.findByOperationId(
      user.businessId,
      dto.operationId,
    );
    if (existing)
      return {
        operationId: dto.operationId,
        status: existing.status,
        resultId: existing.resultId,
      };

    try {
      const result =
        dto.action === 'create'
          ? await this.invoices.create(
              user,
              dto.payload as unknown as CreateInvoiceDto,
            )
          : await this.invoices.update(
              user,
              typeof dto.payload.id === 'string' ? dto.payload.id : '',
              dto.payload as unknown as UpdateInvoiceDto,
            );
      await this.operations.create({
        businessId: user.businessId,
        operationId: dto.operationId,
        entity: dto.entity,
        action: dto.action,
        payload: dto.payload,
        status: 'APPLIED',
        resultId: result.id,
      });
      return {
        operationId: dto.operationId,
        status: 'APPLIED',
        resultId: result.id,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Sinkronisasi gagal.';
      await this.operations.create({
        businessId: user.businessId,
        operationId: dto.operationId,
        entity: dto.entity,
        action: dto.action,
        payload: dto.payload,
        status: 'FAILED',
        error: message,
      });
      throw error;
    }
  }

  async queue(user: AuthenticatedPrincipal) {
    const rows = await this.operations.list(user.businessId);
    return rows.map((row) => ({
      operationId: row.operationId,
      entity: row.entity,
      action: row.action,
      status: row.status,
      error: row.error,
      resultId: row.resultId,
      createdAt: (row as { createdAt?: Date }).createdAt,
    }));
  }
}
