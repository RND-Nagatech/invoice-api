import { ConfigService } from '@nestjs/config';
import { Connection, createConnection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { ResendMailService } from '../auth/email/resend-mail.service.js';
import type { UserRepository } from '../users/repository/user.repository.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import {
  Invoice,
  InvoiceSchema,
  InvoiceCounter,
  InvoiceCounterSchema,
} from '../invoices/schemas/invoice.schema.js';
import {
  Customer,
  CustomerSchema,
} from '../customers/schemas/customer.schema.js';
import { CustomerRepository } from '../customers/repository/customer.repository.js';
import { CustomersService } from '../customers/customers.service.js';
import { InvoiceRepository } from '../invoices/repository/invoice.repository.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import { TemplatesService } from '../templates/templates.service.js';
import {
  Subscription,
  SubscriptionSchema,
} from './schemas/subscription.schema.js';
import {
  SubscriptionPayment,
  SubscriptionPaymentSchema,
} from './schemas/subscription-payment.schema.js';
import { SubscriptionRepository } from './repository/subscription.repository.js';
import { SubscriptionPaymentRepository } from './repository/subscription-payment.repository.js';
import {
  SubscriptionsService,
  addCalendarMonth,
} from './subscriptions.service.js';
import { BillingService, decodeProof } from './billing.service.js';

describe('Subscription quotas and manual review with isolated MongoDB', () => {
  let mongo: MongoMemoryReplSet;
  let connection: Connection;
  let repository: SubscriptionRepository;
  let payments: SubscriptionPaymentRepository;
  let subscriptions: SubscriptionsService;
  let billing: BillingService;
  let customers: CustomersService;
  let invoices: InvoicesService;
  let config: ConfigService;
  const mail = { sendBillingReview: vi.fn().mockResolvedValue(undefined) };
  let user: AuthenticatedPrincipal;
  const proof =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  beforeAll(async () => {
    // This URI is generated for an ephemeral database, never read from .env.
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    connection = await createConnection(mongo.getUri()).asPromise();
    const subscriptionModel = connection.model(
      Subscription.name,
      SubscriptionSchema,
    );
    const invoiceModel = connection.model(Invoice.name, InvoiceSchema);
    const customerModel = connection.model(Customer.name, CustomerSchema);
    const paymentModel = connection.model(
      SubscriptionPayment.name,
      SubscriptionPaymentSchema,
    );
    const counterModel = connection.model(
      InvoiceCounter.name,
      InvoiceCounterSchema,
    );
    await Promise.all([
      subscriptionModel.init(),
      invoiceModel.init(),
      customerModel.init(),
      paymentModel.init(),
      counterModel.init(),
    ]);
    repository = new SubscriptionRepository(
      subscriptionModel,
      invoiceModel,
      customerModel,
    );
    payments = new SubscriptionPaymentRepository(paymentModel);
    const invoiceRepo = new InvoiceRepository(invoiceModel, counterModel);
    const customerRepo = new CustomerRepository(customerModel);
    config = new ConfigService({
      SUBSCRIPTION_PAYMENT_MODE: 'demo',
      SUBSCRIPTION_PRO_PRICE: 129000,
      BILLING_REVIEW_EMAIL: 'review@example.com',
      BILLING_ADMIN_PASSWORD: 'test-admin-password-only',
      BILLING_PUBLIC_BASE_URL: 'http://localhost/api/v1/subscriptions',
    });
    subscriptions = new SubscriptionsService(repository, config);
    billing = new BillingService(
      payments,
      subscriptions,
      {
        findById: async () => ({
          name: '<script>owner</script>',
          email: 'account@example.com',
        }),
      } as unknown as UserRepository,
      mail as unknown as ResendMailService,
      config,
      connection,
    );
    customers = new CustomersService(customerRepo, invoiceRepo, subscriptions);
    invoices = new InvoicesService(
      invoiceRepo,
      customerRepo,
      subscriptions,
      undefined,
      new TemplatesService(),
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
    config.set('SUBSCRIPTION_PAYMENT_MODE', 'demo');
    mail.sendBillingReview.mockReset().mockResolvedValue(undefined);
  });
  async function requestReview() {
    const payment = await billing.checkout(user);
    await billing.submit(user, payment.id, proof);
    return payment;
  }
  async function invoiceData() {
    const customer = await customers.create(user, {
      name: 'Pelanggan',
      type: 'PERSON',
    });
    return {
      customerId: customer.id,
      issueDate: '2099-01-07',
      dueDate: '2099-01-14',
      items: [{ name: 'Layanan', quantity: 1, unitPrice: 100000 }],
    };
  }
  it('allows exactly 10 concurrent invoice saves and blocks duplicates after the limit', async () => {
    const dto = await invoiceData();
    await subscriptions.current(user);
    const results = await Promise.allSettled(
      Array.from({ length: 16 }, () => invoices.create(user, dto)),
    );
    expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(10);
    expect(
      await connection
        .model(Invoice.name)
        .countDocuments({ businessId: user.businessId }),
    ).toBe(10);
    expect((await subscriptions.current(user)).invoiceCount).toBe(10);
    const first = results.find(
      (v) => v.status === 'fulfilled',
    )! as PromiseFulfilledResult<{ id: string }>;
    await expect(
      invoices.duplicate(user, first.value.id),
    ).rejects.toMatchObject({ response: { code: 'SUBSCRIPTION_LIMIT' } });
  });
  it('allows exactly 20 concurrent customers and frees a slot when an unused customer is deleted', async () => {
    await subscriptions.current(user);
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, (_, i) =>
        customers.create(user, { name: 'Customer ' + i, type: 'PERSON' }),
      ),
    );
    expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(20);
    const first = results.find(
      (v) => v.status === 'fulfilled',
    )! as PromiseFulfilledResult<{ id: string }>;
    await customers.delete(user, first.value.id);
    await customers.create(user, { name: 'Replacement', type: 'PERSON' });
    expect((await subscriptions.current(user)).customerCount).toBe(20);
  });
  it('rolls back a reserved slot when customer persistence fails', async () => {
    await expect(
      customers.create(user, { name: '', type: 'PERSON' }),
    ).rejects.toThrow();
    expect((await subscriptions.current(user)).customerCount).toBe(0);
  });
  it('initializes quota from existing data and never resets lifetime invoice usage on reads', async () => {
    await connection
      .model(Customer.name)
      .create({
        businessId: user.businessId,
        name: 'Existing',
        type: 'PERSON',
      });
    expect((await subscriptions.current(user)).customerCount).toBe(1);
    await subscriptions.reserve(user.businessId, 'invoice');
    expect((await subscriptions.current(user)).invoiceCount).toBe(1);
  });
  it('locks Pro templates, voice, logo, reports and reminders for Free', async () => {
    for (const feature of [
      'templates',
      'voice',
      'logo',
      'reports',
      'reminders',
    ] as const)
      await expect(
        subscriptions.assertFeature(user.businessId, feature),
      ).rejects.toMatchObject({ response: { code: 'PRO_REQUIRED' } });
    await expect(
      invoices.create(user, {
        ...(await invoiceData()),
        templateId: 'elegant-dark',
      }),
    ).rejects.toMatchObject({ response: { code: 'PRO_REQUIRED' } });
    expect((await subscriptions.current(user)).invoiceCount).toBe(0);
  });
  it('checkout is idempotent, freezes price, and cannot activate access', async () => {
    const requests = await Promise.all(
      Array.from({ length: 5 }, () => billing.checkout(user)),
    );
    expect(new Set(requests.map((v) => v.id)).size).toBe(1);
    expect(requests[0].amount).toBe(129000);
    expect((await subscriptions.current(user)).planId).toBe('FREE');
  });
  it('stores a proof privately, sends escaped email to the reviewer, and waits for approval', async () => {
    const payment = await requestReview();
    expect((await subscriptions.current(user)).planId).toBe('FREE');
    expect((await billing.latest(user))?.status).toBe('AWAITING_REVIEW');
    expect(
      (await payments.find(payment.id, user.businessId))?.proof,
    ).toBeUndefined();
    expect(mail.sendBillingReview).toHaveBeenCalledWith(
      'review@example.com',
      expect.stringContaining('[DEMO]'),
      expect.stringContaining('&lt;script&gt;'),
      expect.any(Buffer),
      'image/png',
    );
  });
  it('prevents another tenant from submitting, retrying or cancelling a proof', async () => {
    const payment = await billing.checkout(user);
    const other = { ...user, businessId: new Types.ObjectId().toString() };
    await expect(billing.submit(other, payment.id, proof)).rejects.toThrow();
    await expect(billing.cancel(other, payment.id)).rejects.toThrow();
    await expect(billing.retry(other, payment.id)).rejects.toThrow();
    expect(await billing.latest(other)).toBeNull();
  });
  it('retains reviewable proof when email fails and can retry the notification', async () => {
    mail.sendBillingReview.mockRejectedValueOnce(new Error('provider down'));
    const payment = await requestReview();
    expect((await billing.latest(user))?.notificationStatus).toBe('FAILED');
    expect(
      (await payments.find(payment.id, undefined, true))?.proof,
    ).toBeDefined();
    await billing.retry(user, payment.id);
    expect((await billing.latest(user))?.notificationStatus).toBe('SENT');
  });
  it('commits approval and one-month activation together; repeat approval never extends twice', async () => {
    const payment = await requestReview();
    await Promise.all([
      billing.review(payment.id, 'approve', ''),
      billing.review(payment.id, 'approve', ''),
    ]);
    const first = await subscriptions.current(user);
    expect(first.planId).toBe('PRO');
    expect(first.periodEnd!.getTime()).toBe(
      addCalendarMonth(first.periodStart!).getTime(),
    );
    await billing.review(payment.id, 'approve', '');
    expect((await subscriptions.current(user)).periodEnd!.getTime()).toBe(
      first.periodEnd!.getTime(),
    );
    await Promise.all(
      Array.from({ length: 25 }, () =>
        subscriptions.reserve(user.businessId, 'invoice'),
      ),
    );
    expect((await subscriptions.current(user)).invoiceCount).toBe(25);
  });
  it('renews from the current expiry and does not reset usage', async () => {
    const first = await requestReview();
    await billing.review(first.id, 'approve', '');
    const expiry = (await subscriptions.current(user)).periodEnd!;
    await subscriptions.reserve(user.businessId, 'invoice');
    const next = await requestReview();
    await billing.review(next.id, 'approve', '');
    const access = await subscriptions.current(user);
    expect(access.periodEnd!.getTime()).toBe(
      addCalendarMonth(expiry).getTime(),
    );
    expect(access.invoiceCount).toBe(1);
  });
  it('rejects with a reason, does not activate Pro and allows a new request', async () => {
    const payment = await requestReview();
    await expect(billing.review(payment.id, 'reject', '')).rejects.toThrow();
    await billing.review(payment.id, 'reject', 'Bukti tidak sesuai');
    expect((await subscriptions.current(user)).planId).toBe('FREE');
    expect((await billing.checkout(user)).id).not.toBe(payment.id);
  });
  it('expires to Free without deleting old data, which remains readable', async () => {
    const dto = await invoiceData();
    const invoice = await invoices.create(user, dto);
    const payment = await requestReview();
    await billing.review(payment.id, 'approve', '');
    await connection
      .model(Subscription.name)
      .updateOne(
        { businessId: user.businessId },
        { periodEnd: new Date(0), invoiceCount: 10 },
      );
    expect((await subscriptions.current(user)).planId).toBe('FREE');
    expect((await invoices.get(user, invoice.id)).id).toBe(invoice.id);
    await expect(invoices.create(user, dto)).rejects.toMatchObject({
      response: { code: 'SUBSCRIPTION_LIMIT' },
    });
  });
  it('never carries demo Pro across to manual payments', async () => {
    const payment = await requestReview();
    await billing.review(payment.id, 'approve', '');
    config.set('SUBSCRIPTION_PAYMENT_MODE', 'manual');
    expect((await subscriptions.current(user)).planId).toBe('FREE');
    await expect(
      subscriptions.assertFeature(user.businessId, 'voice'),
    ).rejects.toThrow();
    await expect(billing.review(payment.id, 'approve', '')).rejects.toThrow();
  });
  it('validates image type and size', () => {
    expect(decodeProof(proof).mime).toBe('image/png');
    expect(() =>
      decodeProof(Buffer.from('<svg>malicious</svg>').toString('base64')),
    ).toThrow();
    expect(() =>
      decodeProof(Buffer.alloc(6 * 1024 * 1024).toString('base64')),
    ).toThrow();
  });
  it('clamps monthly expiry at the end of the month', () => {
    expect(
      addCalendarMonth(new Date('2027-01-31T12:00:00Z')).toISOString(),
    ).toBe('2027-02-28T12:00:00.000Z');
    expect(
      addCalendarMonth(new Date('2028-01-31T12:00:00Z')).toISOString(),
    ).toBe('2028-02-29T12:00:00.000Z');
  });
});
