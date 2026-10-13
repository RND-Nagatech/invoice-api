import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createConnection, type Connection, Types } from 'mongoose';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import type { CustomerRepository } from '../customers/repository/customer.repository.js';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { PaymentRepository } from '../payments/repository/payment.repository.js';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema.js';
import { PaymentsService } from '../payments/payments.service.js';
import { InvoiceRepository } from './repository/invoice.repository.js';
import {
  Invoice,
  InvoiceSchema,
  InvoiceCounter,
  InvoiceCounterSchema,
} from './schemas/invoice.schema.js';
import { InvoicesService } from './invoices.service.js';

// Isolated database only; no application credentials or live customer records.
describe('Customer invoice experience', () => {
  let mongo: MongoMemoryServer;
  let connection: Connection;
  let repository: InvoiceRepository;
  let payments: PaymentsService;
  let service: InvoicesService;
  let user: AuthenticatedPrincipal;
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=';
  const photo = `data:image/png;base64,${png}`;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    connection = await createConnection(mongo.getUri()).asPromise();
    const invoices = connection.model(Invoice.name, InvoiceSchema);
    const counters = connection.model(
      InvoiceCounter.name,
      InvoiceCounterSchema,
    );
    const paymentModel = connection.model(Payment.name, PaymentSchema);
    await Promise.all([invoices.init(), counters.init(), paymentModel.init()]);
    repository = new InvoiceRepository(invoices, counters);
    payments = new PaymentsService(
      new PaymentRepository(paymentModel),
      repository,
      new ConfigService(),
    );
    service = new InvoicesService(
      repository,
      {} as CustomerRepository,
      {} as SubscriptionsService,
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

  async function invoice() {
    return repository.create({
      businessId: new Types.ObjectId(user.businessId),
      customerId: new Types.ObjectId(),
      customerName: 'Bu Rina',
      invoiceNumber: 'INV-202610-0001',
      publicId: new Types.ObjectId().toString(),
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 86400000),
      status: 'SENT',
      items: [
        {
          name: 'Servis printer',
          quantity: 1,
          unitPrice: 500000,
          lineTotal: 500000,
        },
      ],
      subtotal: 500000,
      discount: 0,
      taxPercent: 0,
      tax: 0,
      additionalFee: 0,
      total: 500000,
    });
  }

  it('stores a public proof privately without paying the invoice and deduplicates retries', async () => {
    const row = await invoice();
    const dto = {
      amount: 100000,
      proofBase64: png,
      requestId: 'request_12345678',
      senderName: 'Bu Rina',
      note: 'DP',
    };
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        payments.submitPublicProof(row.publicId, dto),
      ),
    );
    expect(responses.every((r) => r.accepted)).toBe(true);
    const { items } = await payments.list(user, row.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      status: 'PENDING',
      source: 'CUSTOMER',
      amount: 100000,
      hasProof: true,
    });
    expect(JSON.stringify(items)).not.toContain(png);
    expect(
      (await repository.findById(user.businessId, row.id))?.paidAmount,
    ).toBe(0);
    const proof = await payments.proof(user, items[0].id);
    expect(proof.mime).toBe('image/png');
    // Strip Mongoose document metadata and compare the stored binary payload.
    expect(Buffer.from(proof.buffer)).toEqual(Buffer.from(png, 'base64'));
    await payments.confirmManual(user, items[0].id);
    await payments.confirmManual(user, items[0].id);
    expect(
      (await repository.findById(user.businessId, row.id))?.paidAmount,
    ).toBe(100000);
  });

  it('rejects fake/oversized images, excess nominal, and invalid tokens without writing a payment', async () => {
    const row = await invoice();
    const dto = {
      amount: 100000,
      proofBase64: png,
      requestId: 'request_12345678',
    };
    await expect(
      payments.submitPublicProof(row.publicId, { ...dto, amount: 500001 }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      payments.submitPublicProof(row.publicId, {
        ...dto,
        proofBase64: Buffer.from('this is not an image').toString('base64'),
      }),
    ).rejects.toThrow(BadRequestException);
    const oversized = Buffer.alloc(2 * 1024 * 1024 + 1);
    Buffer.from(png, 'base64').copy(oversized);
    await expect(
      payments.submitPublicProof(row.publicId, {
        ...dto,
        proofBase64: oversized.toString('base64'),
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(payments.submitPublicProof('', dto)).rejects.toThrow(
      ConflictException,
    );
    expect((await payments.list(user, row.id)).items).toHaveLength(0);
  });

  it('forbids another tenant from reading, accepting, or rejecting a submitted proof', async () => {
    const row = await invoice();
    await payments.submitPublicProof(row.publicId, {
      amount: 100000,
      proofBase64: png,
      requestId: 'request_12345678',
    });
    const payment = (await payments.list(user, row.id)).items[0];
    const stranger = { ...user, businessId: new Types.ObjectId().toString() };
    await expect(payments.proof(stranger, payment.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(payments.confirmManual(stranger, payment.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      payments.rejectManual(stranger, payment.id, 'Tidak valid'),
    ).rejects.toThrow(ConflictException);
    await payments.rejectManual(user, payment.id, 'Bukti tidak cocok');
    await expect(payments.confirmManual(user, payment.id)).rejects.toThrow(
      BadRequestException,
    );
    expect(
      (await repository.findById(user.businessId, row.id))?.paidAmount,
    ).toBe(0);
  });

  it('records promise and repeat requests without changing the financial ledger', async () => {
    const row = await invoice();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    await service.promisePayment(row.publicId, {
      date: tomorrow,
      note: 'Menunggu pencairan',
    });
    await service.requestRepeat(row.publicId, {
      message: 'Servis printer lagi',
    });
    const result = (await service.customerActivity(user)).items[0];
    expect(result).toMatchObject({
      promiseNote: 'Menunggu pencairan',
      repeatMessage: 'Servis printer lagi',
      repeatRequestStatus: 'OPEN',
      paidAmount: 0,
      total: 500000,
    });
    expect(result.promisedPaymentDate).toEqual(new Date(tomorrow));
    await expect(
      service.promisePayment(row.publicId, { date: '2000-01-01' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.promisePayment(row.publicId, {
        date: new Date(Date.now() + 367 * 86400000).toISOString(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not acknowledge or hide an activity that arrived after the owner read the screen', async () => {
    const row = await invoice();
    const seen = new Date('2026-10-09T08:00:00Z');
    await repository.updateExperience(user.businessId, row.id, {
      lastCustomerActivityAt: seen,
      repeatRequestedAt: seen,
      repeatRequestStatus: 'OPEN',
    });
    const newer = new Date(seen.getTime() + 1000);
    await repository.updateExperience(user.businessId, row.id, {
      lastCustomerActivityAt: newer,
      repeatRequestedAt: newer,
      repeatMessage: 'Permintaan terbaru',
    });
    await expect(
      service.markActivitySeen(user, row.id, seen.toISOString()),
    ).rejects.toThrow(ConflictException);
    expect((await service.get(user, row.id)).repeatRequestStatus).toBe('OPEN');
    await service.markActivitySeen(user, row.id, newer.toISOString());
    expect((await service.get(user, row.id)).repeatRequestStatus).toBe(
      'RESOLVED',
    );
  });

  it('updates a paid invoice service record without rewriting its amounts and scopes photos', async () => {
    const row = await invoice();
    await repository.applyPayment(
      user.businessId,
      row.id,
      'already-confirmed',
      500000,
    );
    await service.saveServiceRecord(user, row.id, {
      serialNumber: 'Canon SN123',
      workSummary: 'Ganti roller · garansi suku cadang',
      warrantyStartsAt: '2026-10-09',
      warrantyUntil: '2027-01-09',
      nextServiceAt: '2027-04-09',
      photos: [photo],
    });
    const saved = await service.get(user, row.id);
    expect(saved).toMatchObject({
      paidAmount: 500000,
      total: 500000,
      status: 'PAID',
      serviceRecord: { photoCount: 1, serialNumber: 'Canon SN123' },
    });
    expect(JSON.stringify(saved)).not.toContain(png);
    expect((await service.serviceRecord(user, row.id)).record?.photos).toEqual([
      photo,
    ]);
    expect((await service.publicServicePhoto(row.publicId, 0)).mime).toBe(
      'image/png',
    );
    await expect(service.publicServicePhoto(row.publicId, 3)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.serviceRecord(
        { ...user, businessId: new Types.ObjectId().toString() },
        row.id,
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.saveServiceRecord(user, row.id, {
        warrantyUntil: '2027-01-01',
        photos: [],
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.saveServiceRecord(user, row.id, {
        warrantyStartsAt: '2027-01-01',
        warrantyUntil: '2026-01-01',
        photos: [],
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.promisePayment(row.publicId, {
        date: new Date(Date.now() + 86400000).toISOString(),
      }),
    ).rejects.toThrow(ConflictException);
    await service.requestRepeat(row.publicId, { message: 'Pesan lagi' });
  });

  it('does not accept customer actions or serve service photos on a cancelled invoice', async () => {
    const row = await invoice();
    await service.saveServiceRecord(user, row.id, { photos: [photo] });
    await repository.transition(user.businessId, row.id, 'CANCELLED');
    await expect(service.requestRepeat(row.publicId, {})).rejects.toThrow(
      ConflictException,
    );
    await expect(
      payments.submitPublicProof(row.publicId, {
        amount: 100000,
        proofBase64: png,
        requestId: 'request_12345678',
      }),
    ).rejects.toThrow(ConflictException);
    await expect(service.publicServicePhoto(row.publicId, 0)).rejects.toThrow(
      NotFoundException,
    );
  });
});
