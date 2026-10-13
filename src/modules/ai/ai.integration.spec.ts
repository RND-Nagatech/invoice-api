import { ConfigService } from '@nestjs/config';
import { Connection, Model, Types, createConnection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import {
  Customer,
  CustomerSchema,
} from '../customers/schemas/customer.schema.js';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema.js';
import { Item, ItemSchema } from '../items/schemas/item.schema.js';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { AiService } from './ai.service.js';
import { AiDraftContextRepository } from './repository/ai-draft-context.repository.js';
import { AiVoiceUsageRepository } from './repository/ai-voice-usage.repository.js';
import {
  AiVoiceUsage,
  AiVoiceUsageSchema,
} from './schemas/ai-voice-usage.schema.js';

describe('Smart invoice isolation and lifetime voice trial limits', () => {
  let mongo: MongoMemoryServer;
  let connection: Connection;
  let customers: Model<Customer>;
  let items: Model<Item>;
  let invoices: Model<Invoice>;
  let usage: AiVoiceUsageRepository;
  let context: AiDraftContextRepository;
  let service: AiService;
  let config: ConfigService;
  let user: AuthenticatedPrincipal;
  let pro = false;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    connection = await createConnection(mongo.getUri()).asPromise();
    customers = connection.model(Customer.name, CustomerSchema);
    items = connection.model(Item.name, ItemSchema);
    invoices = connection.model(Invoice.name, InvoiceSchema);
    const usageModel = connection.model(AiVoiceUsage.name, AiVoiceUsageSchema);
    await Promise.all([
      customers.init(),
      items.init(),
      invoices.init(),
      usageModel.init(),
    ]);
    context = new AiDraftContextRepository(customers, items, invoices);
    usage = new AiVoiceUsageRepository(usageModel);
    config = new ConfigService({ AI_FREE_VOICE_TRIAL_LIMIT: 3 });
    service = new AiService(
      context,
      usage,
      {
        current: async () => ({ planId: pro ? 'PRO' : 'FREE' }),
      } as unknown as SubscriptionsService,
      config,
    );
  }, 120000);

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
    pro = false;
    config.set('AI_FREE_VOICE_TRIAL_LIMIT', 3);
  });

  async function customer(businessId = user.businessId, name = 'Budi') {
    return customers.create({ businessId, name, type: 'PERSON' });
  }

  async function previousInvoice(
    businessId: string,
    customerId: string,
    amount: number,
    number: string,
  ) {
    return invoices.create({
      businessId,
      customerId,
      customerName: 'Budi',
      invoiceNumber: number,
      issueDate: new Date('2026-10-01'),
      dueDate: new Date('2026-10-08'),
      status: 'PAID',
      items: [
        {
          name: 'Servis AC',
          description: 'Bersihkan AC',
          quantity: 1,
          unit: 'unit',
          unitPrice: amount,
          lineTotal: amount,
        },
      ],
      subtotal: amount,
      discount: 0,
      taxPercent: 0,
      tax: 0,
      additionalFee: 0,
      total: amount,
      paidAmount: amount,
    });
  }

  it('allows exactly 3 concurrent successful Free voice drafts and never creates financial data', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        service.voice(user, {
          transcript:
            'Invoice Rina, servis AC dua unit harga 150 ribu, jatuh tempo besok',
        }),
      ),
    );
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(9);
    expect(await service.usage(user)).toMatchObject({
      isPro: false,
      voiceTrialLimit: 3,
      voiceTrialUsed: 3,
      voiceTrialRemaining: 0,
    });
    expect(
      await customers.countDocuments({ businessId: user.businessId }),
    ).toBe(0);
    expect(await invoices.countDocuments({ businessId: user.businessId })).toBe(
      0,
    );
    await expect(
      service.voice(user, { transcript: 'Invoice Rina, servis 150 ribu' }),
    ).rejects.toMatchObject({
      response: { code: 'PRO_REQUIRED', details: { feature: 'voice' } },
    });
    await expect(
      service.text(user, { text: 'Invoice Rina, servis 150 ribu' }),
    ).resolves.toMatchObject({ status: 'DRAFT', needsReview: true });
  });

  it('leaves malformed voice requests uncharged and makes Pro unrestricted', async () => {
    await expect(
      service.voice(user, { audioBase64: 'YXVkaW8=' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await usage.used(user.businessId)).toBe(0);
    pro = true;
    const result = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.voice(user, {
          transcript: 'Invoice Rina, item Servis harga 100 ribu',
        }),
      ),
    );
    expect(result).toHaveLength(5);
    expect(await service.usage(user)).toMatchObject({
      isPro: true,
      voiceTrialUsed: 0,
      voiceTrialRemaining: null,
    });
  });

  it('keeps the used and remaining counters across usage refreshes and service recreation', async () => {
    const transcript = 'Invoice Rina, Servis AC dua unit harga 150 ribu';
    expect(await service.usage(user)).toMatchObject({
      voiceTrialLimit: 3,
      voiceTrialUsed: 0,
      voiceTrialRemaining: 3,
    });
    await service.voice(user, {
      transcript,
      requestId: 'voice-persistent-001',
    });
    const restored = new AiService(
      context,
      new AiVoiceUsageRepository(
        connection.model<AiVoiceUsage>(AiVoiceUsage.name),
      ),
      {
        current: async () => ({ planId: 'FREE' }),
      } as unknown as SubscriptionsService,
      config,
    );
    expect(await restored.usage(user)).toMatchObject({
      voiceTrialUsed: 1,
      voiceTrialRemaining: 2,
    });
    await expect(
      restored.voice(user, { transcript: ' ' }),
    ).rejects.toMatchObject({
      status: 400,
    });
    await restored.text(user, { text: transcript });
    expect(await restored.usage(user)).toMatchObject({
      voiceTrialUsed: 1,
      voiceTrialRemaining: 2,
    });
    for (const count of [2, 3]) {
      await restored.voice(user, {
        transcript,
        requestId: `voice-persistent-00${count}`,
      });
      expect(await service.usage(user)).toMatchObject({
        voiceTrialUsed: count,
        voiceTrialRemaining: 3 - count,
      });
    }
    await expect(
      restored.voice(user, { transcript, requestId: 'voice-persistent-004' }),
    ).rejects.toMatchObject({ response: { code: 'PRO_REQUIRED' } });
    expect(await restored.usage(user)).toMatchObject({
      voiceTrialUsed: 3,
      voiceTrialRemaining: 0,
    });
  });

  it('charges one trial for concurrent retries and rejects a reused key with a different transcript', async () => {
    const dto = {
      requestId: 'voice-retry-test-001',
      transcript: 'Invoice Rina, Servis AC dua unit harga 150 ribu',
    };
    const retried = await Promise.all(
      Array.from({ length: 8 }, () => service.voice(user, dto)),
    );
    expect(retried).toHaveLength(8);
    expect(await usage.used(user.businessId)).toBe(1);
    await expect(
      service.voice(user, {
        ...dto,
        transcript: 'Invoice Budi, Servis AC harga 300 ribu',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await usage.used(user.businessId)).toBe(1);
    await service.voice(user, { ...dto, requestId: 'voice-new-test-002' });
    await service.voice(user, { ...dto, requestId: 'voice-new-test-003' });
    await expect(service.voice(user, dto)).resolves.toMatchObject({
      status: 'DRAFT',
    });
    expect(await usage.used(user.businessId)).toBe(3);
  });

  it('supports configurable zero trials without blocking text draft preparation', async () => {
    config.set('AI_FREE_VOICE_TRIAL_LIMIT', 0);
    await expect(
      service.voice(user, {
        transcript: 'Invoice Rina, item Servis harga 100 ribu',
      }),
    ).rejects.toMatchObject({ response: { code: 'PRO_REQUIRED' } });
    await expect(
      service.text(user, { text: 'Invoice Rina, item Servis harga 100 ribu' }),
    ).resolves.toMatchObject({ source: 'TEXT' });
    expect(await usage.used(user.businessId)).toBe(0);
  });

  it('preserves retry aliases when one proven duplicate trial is refunded', async () => {
    const transcript = 'Invoice Rina, Servis AC dua unit harga 150 ribu';
    const requests = [
      'voice-original-001',
      'voice-original-002',
      'voice-original-003',
    ];
    for (const requestId of requests)
      await service.voice(user, { transcript, requestId });
    await connection
      .model<AiVoiceUsage>(AiVoiceUsage.name)
      .updateOne(
        { businessId: user.businessId, successfulDrafts: 3 },
        { $set: { successfulDrafts: 2 } },
      );
    for (const requestId of requests)
      await service.voice(user, { transcript, requestId });
    expect(await service.usage(user)).toMatchObject({
      voiceTrialUsed: 2,
      voiceTrialRemaining: 1,
    });
    await service.voice(user, {
      transcript,
      requestId: 'voice-new-refunded-slot',
    });
    expect(await usage.used(user.businessId)).toBe(3);
    await service.voice(user, { transcript, requestId: requests[2] });
    expect(await usage.used(user.businessId)).toBe(3);
  });

  it('matches exactly one customer in this business and cannot copy another tenant invoice', async () => {
    const own = await customer();
    const otherBusiness = new Types.ObjectId().toString();
    const other = await customer(otherBusiness);
    await previousInvoice(otherBusiness, other.id, 900000, 'OTHER-SECRET');
    const first = await service.text(user, {
      text: 'Bikin tagihan Pak Budi seperti kemarin, jumlahnya tiga',
    });
    expect(first.draft.customerId).toBe(own.id);
    expect(first.draft.items).toEqual([]);
    expect(first.reviewWarnings.join(' ')).not.toContain('OTHER-SECRET');
    await previousInvoice(user.businessId, own.id, 150000, 'INV-OWN-001');
    const next = await service.text(user, {
      text: 'Bikin tagihan Pak Budi seperti kemarin, jumlahnya tiga',
    });
    expect(next.draft.items).toMatchObject([
      { name: 'Servis AC', quantity: 3, unitPrice: 150000 },
    ]);
    expect(next.draft.depositAmount).toBe(0);
    expect(next.reviewWarnings.join(' ')).toContain('INV-OWN-001');
    expect(next.draft).not.toHaveProperty('paidAmount');
  });

  it('does not fuzzy-select a longer name or choose among duplicate customer names', async () => {
    await customer(user.businessId, 'Budi Santoso');
    const unmatched = await service.text(user, {
      text: 'Invoice Pak Budi, Servis 100 ribu',
    });
    expect(unmatched.draft.customerId).toBeUndefined();
    await customer(user.businessId, 'Budi');
    await customer(user.businessId, 'Pak Budi');
    const ambiguous = await service.text(user, {
      text: 'Invoice Pak Budi, Servis 100 ribu',
    });
    expect(ambiguous.draft.customerId).toBeUndefined();
    expect(ambiguous.reviewWarnings.join(' ')).toContain(
      'lebih dari satu pelanggan',
    );
  });

  it('uses only this tenant catalog exact price and warns when a catalog item is ambiguous', async () => {
    const otherBusiness = new Types.ObjectId().toString();
    await items.create({
      businessId: otherBusiness,
      name: 'Servis AC',
      unit: 'paket',
      defaultPrice: 900000,
    });
    const missing = await service.text(user, {
      text: 'Invoice Rina, Servis AC dua unit',
    });
    expect(missing.draft.items[0].unitPrice).toBe(0);
    await items.create({
      businessId: user.businessId,
      name: 'Servis AC',
      unit: 'paket',
      defaultPrice: 150000,
    });
    const found = await service.text(user, {
      text: 'Invoice Rina, Servis AC dua unit',
    });
    expect(found.draft.items[0]).toMatchObject({
      unitPrice: 150000,
      unit: 'unit',
    });
    expect(found.reviewWarnings.join(' ')).toContain('katalog bisnis Anda');
    const explicit = await service.text(user, {
      text: 'Invoice Rina, Servis AC dua unit harga 200 ribu',
    });
    expect(explicit.draft.items[0].unitPrice).toBe(200000);
    await items.create({
      businessId: user.businessId,
      name: 'Servis AC',
      unit: 'paket',
      defaultPrice: 100000,
    });
    const ambiguous = await service.text(user, {
      text: 'Invoice Rina, Servis AC dua unit',
    });
    expect(ambiguous.draft.items[0].unitPrice).toBe(0);
    expect(ambiguous.reviewWarnings.join(' ')).toContain(
      'beberapa harga katalog',
    );
  });

  it('calculates percent discount and DP after catalog resolution and warns on excessive DP', async () => {
    await items.create({
      businessId: user.businessId,
      name: 'Servis AC',
      defaultPrice: 150000,
    });
    const result = await service.text(user, {
      text: 'Invoice Rina, Servis AC dua unit, diskon 10 persen, pajak 10 persen, DP setengah, pelunasan besok',
    });
    expect(result.draft.discount).toBe(30000);
    expect(result.draft.depositAmount).toBe(148500);
    const excessive = await service.text(user, {
      text: 'Invoice Rina, Servis AC dua unit, DP 400 ribu',
    });
    expect(excessive.reviewWarnings.join(' ')).toContain('DP melebihi total');
  });
});
