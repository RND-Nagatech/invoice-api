import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { type Connection, type Model, createConnection, Types } from 'mongoose';
import { createHmac } from 'node:crypto';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { InvoiceRepository } from '../invoices/repository/invoice.repository.js';
import {
  Invoice,
  InvoiceSchema,
  InvoiceCounter,
  InvoiceCounterSchema,
} from '../invoices/schemas/invoice.schema.js';
import type { CreatePaymentDto } from './dto/payment.dto.js';
import { PaymentRepository } from './repository/payment.repository.js';
import { Payment, PaymentSchema } from './schemas/payment.schema.js';
import { PaymentsService } from './payments.service.js';

describe('Manual invoice payments with isolated MongoDB', () => {
  let mongo: MongoMemoryServer;
  let connection: Connection;
  let invoiceModel: Model<Invoice>;
  let paymentModel: Model<Payment>;
  let invoiceRepository: InvoiceRepository;
  let paymentRepository: PaymentRepository;
  let service: PaymentsService;
  let user: AuthenticatedPrincipal;
  const webhookSecret = 'isolated-payment-test-secret';

  beforeAll(async () => {
    // The test creates its own database and never reads the application's URI.
    mongo = await MongoMemoryServer.create();
    connection = await createConnection(mongo.getUri()).asPromise();
    invoiceModel = connection.model(Invoice.name, InvoiceSchema);
    paymentModel = connection.model(Payment.name, PaymentSchema);
    const counterModel = connection.model(
      InvoiceCounter.name,
      InvoiceCounterSchema,
    );
    await Promise.all([
      invoiceModel.init(),
      paymentModel.init(),
      counterModel.init(),
    ]);
    invoiceRepository = new InvoiceRepository(invoiceModel, counterModel);
    paymentRepository = new PaymentRepository(paymentModel);
    service = new PaymentsService(
      paymentRepository,
      invoiceRepository,
      new ConfigService({ PAYMENT_WEBHOOK_SECRET: webhookSecret }),
    );
  }, 120_000);

  afterAll(async () => {
    if (connection) await connection.close();
    if (mongo) await mongo.stop();
  });

  beforeEach(() => {
    user = {
      id: new Types.ObjectId().toString(),
      businessId: new Types.ObjectId().toString(),
      sessionId: new Types.ObjectId().toString(),
    };
  });

  async function createInvoice(total = 500_000) {
    const issueDate = new Date('2099-01-07T00:00:00.000Z');
    const invoiceNumber = await invoiceRepository.nextNumber(
      user.businessId,
      issueDate,
    );
    return invoiceRepository.create({
      businessId: new Types.ObjectId(user.businessId),
      customerId: new Types.ObjectId(),
      customerName: 'Bu Rina',
      invoiceNumber,
      issueDate,
      dueDate: new Date('2099-01-14T00:00:00.000Z'),
      status: 'SENT',
      items: [
        {
          name: 'Servis AC',
          quantity: 1,
          unitPrice: total,
          lineTotal: total,
        },
      ],
      subtotal: total,
      total,
      discount: 0,
      taxPercent: 0,
      tax: 0,
      additionalFee: 0,
    });
  }

  async function readInvoice(invoiceId: string) {
    return invoiceModel.findById(invoiceId).orFail().exec();
  }

  function pending(
    invoiceId: string,
    amount?: number,
    idempotencyKey?: string,
  ) {
    return service.create(user, {
      invoiceId,
      provider: 'MANUAL',
      amount,
      idempotencyKey,
    });
  }

  it('keeps a recorded DP pending until confirmation, then settles the remaining balance', async () => {
    const invoice = await createInvoice();
    const dp = await pending(invoice.id, 100_000);
    const before = await readInvoice(invoice.id);

    expect(dp).toMatchObject({
      amount: 100_000,
      status: 'PENDING',
      invoiceNumber: invoice.invoiceNumber,
    });
    expect(before.paidAmount).toBe(0);
    expect(before.status).toBe('SENT');
    expect(before.appliedPaymentReferences).toEqual([]);

    const confirmation = await service.confirmManual(user, dp.id);
    const partial = await readInvoice(invoice.id);
    expect(confirmation.status).toBe('PAID');
    expect(partial.status).toBe('PARTIALLY_PAID');
    expect(partial.paidAmount).toBe(100_000);
    expect(partial.total - partial.paidAmount).toBe(400_000);
    expect(partial.paidAt).toBeNull();

    const remaining = await pending(invoice.id);
    expect(remaining.amount).toBe(400_000);
    await service.confirmManual(user, remaining.id);

    const settled = await readInvoice(invoice.id);
    expect(settled.status).toBe('PAID');
    expect(settled.paidAmount).toBe(500_000);
    expect(settled.paidAt).toBeInstanceOf(Date);
    expect(settled.appliedPaymentReferences).toHaveLength(2);
  });

  it('counts concurrent confirmations and retries of the same transfer exactly once', async () => {
    const invoice = await createInvoice();
    const dp = await pending(invoice.id, 100_000);

    const results = await Promise.all(
      Array.from({ length: 12 }, () => service.confirmManual(user, dp.id)),
    );
    await service.confirmManual(user, dp.id);

    const updated = await readInvoice(invoice.id);
    expect(results.every((result) => result.status === 'PAID')).toBe(true);
    expect(updated.paidAmount).toBe(100_000);
    expect(updated.status).toBe('PARTIALLY_PAID');
    expect(updated.appliedPaymentReferences).toEqual([dp.providerReference]);
    expect(updated.version).toBe(1);
    expect(await paymentModel.countDocuments({ invoiceId: invoice._id })).toBe(
      1,
    );
  });

  it('adds distinct transfers atomically without losing a concurrent payment', async () => {
    const invoice = await createInvoice();
    const transfers = await Promise.all(
      Array.from({ length: 5 }, () => pending(invoice.id, 100_000)),
    );

    await Promise.all(
      transfers.map((payment) => service.confirmManual(user, payment.id)),
    );

    const updated = await readInvoice(invoice.id);
    expect(updated.paidAmount).toBe(500_000);
    expect(updated.status).toBe('PAID');
    expect(updated.appliedPaymentReferences).toHaveLength(5);
    expect(new Set(updated.appliedPaymentReferences).size).toBe(5);
    expect(updated.version).toBe(5);
    expect(
      await paymentModel.countDocuments({
        invoiceId: invoice._id,
        status: 'PAID',
      }),
    ).toBe(5);
  });

  it('recovers a confirmation interrupted between invoice ledger and payment status writes', async () => {
    const invoice = await createInvoice();
    const transfer = await pending(invoice.id, 100_000);
    await invoiceRepository.applyPayment(
      user.businessId,
      invoice.id,
      transfer.providerReference,
      transfer.amount,
    );

    expect((await service.get(user, transfer.id)).status).toBe('PENDING');
    await service.confirmManual(user, transfer.id);

    const updated = await readInvoice(invoice.id);
    expect(updated.paidAmount).toBe(100_000);
    expect(updated.appliedPaymentReferences).toHaveLength(1);
    expect(updated.version).toBe(1);
    expect((await service.get(user, transfer.id)).status).toBe('PAID');
  });

  it('rejects invalid or excessive amounts before storing a pending transfer', async () => {
    const invoice = await createInvoice();
    for (const invalid of [0, -1, 500_001, 0.5, Number.NaN]) {
      await expect(pending(invoice.id, invalid)).rejects.toThrow(
        BadRequestException,
      );
    }

    const dp = await pending(invoice.id, 100_000);
    await service.confirmManual(user, dp.id);
    await expect(pending(invoice.id, 400_001)).rejects.toThrow(
      BadRequestException,
    );

    expect(await paymentModel.countDocuments({ invoiceId: invoice._id })).toBe(
      1,
    );
    expect((await readInvoice(invoice.id)).paidAmount).toBe(100_000);
  });

  it('prevents concurrent pending transfers from overpaying the invoice at confirmation', async () => {
    const invoice = await createInvoice();
    const transfers = await Promise.all([
      pending(invoice.id, 300_000),
      pending(invoice.id, 300_000),
    ]);

    const results = await Promise.allSettled(
      transfers.map((payment) => service.confirmManual(user, payment.id)),
    );

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(
      ConflictException,
    );
    const updated = await readInvoice(invoice.id);
    expect(updated.paidAmount).toBe(300_000);
    expect(updated.status).toBe('PARTIALLY_PAID');
    expect(updated.appliedPaymentReferences).toHaveLength(1);
    expect(
      await paymentModel.countDocuments({
        invoiceId: invoice._id,
        status: 'PENDING',
      }),
    ).toBe(1);
  });

  it('isolates create, lookup, list and confirmation to the owning business', async () => {
    const invoice = await createInvoice();
    const transfer = await pending(invoice.id, 100_000);
    const stranger: AuthenticatedPrincipal = {
      ...user,
      businessId: new Types.ObjectId().toString(),
    };

    await expect(
      service.create(stranger, {
        invoiceId: invoice.id,
        provider: 'MANUAL',
        amount: 100_000,
      }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.get(stranger, transfer.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.confirmManual(stranger, transfer.id)).rejects.toThrow(
      NotFoundException,
    );
    expect((await service.list(stranger, invoice.id)).items).toEqual([]);
    expect((await service.list(user, invoice.id)).items).toHaveLength(1);
    expect((await readInvoice(invoice.id)).paidAmount).toBe(0);
  });

  it('stores only one pending payment when duplicate requests use the same key concurrently', async () => {
    const invoice = await createInvoice();
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        pending(invoice.id, 100_000, 'dp-request-1'),
      ),
    );

    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(await paymentModel.countDocuments({ invoiceId: invoice._id })).toBe(
      1,
    );
    expect((await readInvoice(invoice.id)).paidAmount).toBe(0);
    await expect(pending(invoice.id, 200_000, 'dp-request-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('scopes request keys to a business and prevents reuse for another invoice', async () => {
    const firstInvoice = await createInvoice();
    const secondInvoice = await createInvoice();
    await pending(firstInvoice.id, 100_000, 'same-request');
    await expect(
      pending(secondInvoice.id, 100_000, 'same-request'),
    ).rejects.toThrow(ConflictException);

    const firstBusinessId = user.businessId;
    user = { ...user, businessId: new Types.ObjectId().toString() };
    const otherBusinessInvoice = await createInvoice();
    const otherTransfer = await pending(
      otherBusinessInvoice.id,
      100_000,
      'same-request',
    );
    const saved = await paymentModel.findById(otherTransfer.id).orFail().exec();
    expect(saved.businessId.toString()).not.toBe(firstBusinessId);
    expect(saved.businessId.toString()).toBe(user.businessId);
  });

  it.each([400_000, 500_000])(
    'replays the same create request after confirming %i without comparing the new balance',
    async (amount) => {
      const invoice = await createInvoice();
      const payment = await pending(invoice.id, amount, 'confirmed-request');
      await service.confirmManual(user, payment.id);

      const replay = await pending(invoice.id, amount, 'confirmed-request');

      expect(replay.id).toBe(payment.id);
      expect(replay.amount).toBe(amount);
      expect(replay.status).toBe('PAID');
      expect(
        await paymentModel.countDocuments({ invoiceId: invoice._id }),
      ).toBe(1);
      expect((await readInvoice(invoice.id)).paidAmount).toBe(amount);
    },
  );

  it('replays an omitted-amount full-payment request after the invoice is paid', async () => {
    const invoice = await createInvoice();
    const payment = await pending(invoice.id, undefined, 'settle-request');
    await service.confirmManual(user, payment.id);

    const replay = await pending(invoice.id, undefined, 'settle-request');

    expect(replay).toMatchObject({
      id: payment.id,
      amount: 500_000,
      status: 'PAID',
    });
    expect(
      (await readInvoice(invoice.id)).appliedPaymentReferences,
    ).toHaveLength(1);
  });

  it('keeps changed idempotency payloads conflicting after the original transfer is confirmed', async () => {
    const invoice = await createInvoice();
    const payment = await pending(invoice.id, 400_000, 'confirmed-request');
    await service.confirmManual(user, payment.id);

    await expect(
      pending(invoice.id, 300_000, 'confirmed-request'),
    ).rejects.toThrow(ConflictException);

    expect((await readInvoice(invoice.id)).paidAmount).toBe(400_000);
    expect(await paymentModel.countDocuments({ invoiceId: invoice._id })).toBe(
      1,
    );
  });

  it('releases an unapplied overpay claim so the owner can reject the stale transfer', async () => {
    const invoice = await createInvoice();
    const first = await pending(invoice.id, 300_000);
    const stale = await pending(invoice.id, 300_000);
    await service.confirmManual(user, first.id);

    await expect(service.confirmManual(user, stale.id)).rejects.toThrow(
      ConflictException,
    );
    expect((await service.get(user, stale.id)).status).toBe('PENDING');
    await service.rejectManual(user, stale.id, 'Nominal melebihi sisa tagihan');

    expect((await service.get(user, stale.id)).status).toBe('FAILED');
    const updated = await readInvoice(invoice.id);
    expect(updated.paidAmount).toBe(300_000);
    expect(updated.appliedPaymentReferences).toHaveLength(1);
  });

  it('recovers a PROCESSING transfer after a worker stops before the ledger update', async () => {
    const invoice = await createInvoice();
    const payment = await pending(invoice.id, 100_000);
    await paymentRepository.claimManual(user.businessId, payment.id);
    expect((await service.get(user, payment.id)).status).toBe('PROCESSING');

    await service.confirmManual(user, payment.id);
    await service.confirmManual(user, payment.id);

    expect((await service.get(user, payment.id)).status).toBe('PAID');
    const updated = await readInvoice(invoice.id);
    expect(updated.paidAmount).toBe(100_000);
    expect(updated.appliedPaymentReferences).toHaveLength(1);
  });

  it('allows exactly one approval or rejection to win a concurrent review', async () => {
    const invoice = await createInvoice();
    const payment = await pending(invoice.id, 100_000);

    const results = await Promise.allSettled([
      service.confirmManual(user, payment.id),
      service.rejectManual(user, payment.id, 'Bukti transfer tidak valid'),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const savedPayment = await service.get(user, payment.id);
    const updated = await readInvoice(invoice.id);
    expect(['PAID', 'FAILED']).toContain(savedPayment.status);
    expect(updated.paidAmount).toBe(
      savedPayment.status === 'PAID' ? 100_000 : 0,
    );
    expect(updated.appliedPaymentReferences).toHaveLength(
      savedPayment.status === 'PAID' ? 1 : 0,
    );
  });

  it('keeps manual confirmation separate from disabled providers and signed webhooks', async () => {
    const invoice = await createInvoice();
    await expect(
      service.create(user, {
        invoiceId: invoice.id,
        provider: 'SINGAPAY',
      } as unknown as CreatePaymentDto),
    ).rejects.toThrow(ServiceUnavailableException);

    const transfer = await pending(invoice.id, 100_000);
    const signature = createHmac('sha256', webhookSecret)
      .update(`manual:${transfer.providerReference}:PAID`)
      .digest('hex');
    await expect(
      service.webhook('manual', signature, {
        providerReference: transfer.providerReference,
        status: 'PAID',
      }),
    ).rejects.toThrow(UnauthorizedException);

    const providerPayment = await paymentRepository.create({
      businessId: new Types.ObjectId(user.businessId),
      invoiceId: invoice._id,
      provider: 'SINGAPAY',
      providerReference: `provider_${new Types.ObjectId().toString()}`,
      amount: 100_000,
      status: 'PENDING',
    });
    await expect(
      service.confirmManual(user, providerPayment.id),
    ).rejects.toThrow(BadRequestException);
    expect((await readInvoice(invoice.id)).paidAmount).toBe(0);
    expect((await service.get(user, transfer.id)).status).toBe('PENDING');
  });
});
