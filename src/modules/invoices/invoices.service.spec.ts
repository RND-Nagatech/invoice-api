import type { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import type { CustomerRepository } from '../customers/repository/customer.repository.js';
import type { InvoiceRepository } from './repository/invoice.repository.js';
import type { InvoiceDocument } from './schemas/invoice.schema.js';
import { InvoicesService } from './invoices.service.js';

describe('InvoicesService', () => {
  const subscription = {
    reserve: vi.fn(),
    release: vi.fn(),
    assertFeature: vi.fn(),
  } as unknown as SubscriptionsService;
  const businessId = new Types.ObjectId().toString();
  const customerId = new Types.ObjectId().toString();
  const principal: AuthenticatedPrincipal = {
    id: new Types.ObjectId().toString(),
    businessId,
    sessionId: new Types.ObjectId().toString(),
  };
  const dto = {
    customerId,
    issueDate: '2099-01-07T00:00:00.000Z',
    dueDate: '2099-01-14T00:00:00.000Z',
    items: [{ name: 'Service AC', quantity: 2, unitPrice: 75_000 }],
  };

  it('uses the signed-in business and calculates totals on the server', async () => {
    const findById = vi
      .fn()
      .mockResolvedValue({ id: customerId, name: 'Pak Budi' });
    const create = vi.fn().mockImplementation(
      async (input: Record<string, unknown>) =>
        ({
          ...input,
          id: new Types.ObjectId().toString(),
          businessId: new Types.ObjectId(businessId),
          customerId: new Types.ObjectId(customerId),
          paidAt: null,
        }) as InvoiceDocument,
    );
    const invoices = {
      nextNumber: vi.fn().mockResolvedValue('INV-209901-0001'),
      create,
    } as unknown as InvoiceRepository;
    const customers = { findById } as unknown as CustomerRepository;
    const service = new InvoicesService(invoices, customers, subscription);

    const invoice = await service.create(principal, {
      ...dto,
      total: 1,
    } as typeof dto);

    expect(findById).toHaveBeenCalledWith(businessId, customerId);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        subtotal: 150_000,
        total: 150_000,
      }),
    );
    expect(invoice.total).toBe(150_000);
  });

  it('does not create an invoice for a customer outside the signed-in business', async () => {
    const customers = {
      findById: vi.fn().mockResolvedValue(null),
    } as unknown as CustomerRepository;
    const create = vi.fn();
    const invoices = { create } as unknown as InvoiceRepository;
    await expect(
      new InvoicesService(invoices, customers, subscription).create(
        principal,
        dto,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });
});
