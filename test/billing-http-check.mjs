// Run after `npm run build`. Uses only ephemeral MongoDB and Redis.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';

import request from 'supertest';

let mongo;
let app;
let redisStarted = false;
const container = 'invoicekilat-billing-qa-' + randomUUID().slice(0, 8);
try {
  execFileSync(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      container,
      '-p',
      '127.0.0.1::6379',
      'redis:7',
      'redis-server',
      '--save',
      '',
      '--appendonly',
      'no',
    ],
    { stdio: 'pipe' },
  );
  redisStarted = true;
  const redisPort = execFileSync('docker', ['port', container, '6379/tcp'], {
    encoding: 'utf8',
  })
    .trim()
    .split(':')
    .at(-1);
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  Object.assign(process.env, {
    NODE_ENV: 'development',
    MONGODB_URI: mongo.getUri(),
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: redisPort,
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM_EMAIL: 'no-reply@example.com',
    RESEND_TEST_RECIPIENT: '',
    SUBSCRIPTION_PAYMENT_MODE: 'demo',
    SUBSCRIPTION_PRO_PRICE: '129000',
    BILLING_REVIEW_EMAIL: 'review@example.com',
    BILLING_ADMIN_PASSWORD: 'test-only-admin-password',
    BILLING_PUBLIC_BASE_URL: 'http://localhost:3000/api/v1/subscriptions',
    SINGAPAY_ENABLED: 'false',
  });
  const { AppModule } = await import('../dist/app.module.js');
  const { ApiExceptionFilter } =
    await import('../dist/common/filters/api-exception.filter.js');
  const { ApiResponseInterceptor } =
    await import('../dist/common/interceptors/api-response.interceptor.js');
  const { ResendMailService } =
    await import('../dist/modules/auth/email/resend-mail.service.js');
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ResendMailService)
    .useValue({
      sendBillingReview: async () => {},
      sendReminder: async () => {},
      sendPasswordResetOtp: async () => {},
    })
    .compile();
  app = module.createNestApplication({ logger: false });
  const { configureJsonBody } =
    await import('../dist/common/configure-json-body.js');
  configureJsonBody(app);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  await app.init();
  const server = app.getHttpServer();
  const account = await request(server)
    .post('/api/v1/auth/register')
    .send({
      name: 'Demo QA',
      businessName: 'QA Business',
      email: 'qa@example.com',
      password: 'StrongPass123!',
    });
  assert.equal(account.status, 201, JSON.stringify(account.body));
  const token = account.body.data.accessToken;
  assert.ok(token);
  const get = (path) =>
    request(server)
      .get('/api/v1' + path)
      .auth(token, { type: 'bearer' });
  const post = (path, data) =>
    request(server)
      .post('/api/v1' + path)
      .auth(token, { type: 'bearer' })
      .send(data);
  assert.equal(
    (await get('/subscriptions/current').expect(200)).body.data.planId,
    'FREE',
  );
  await post('/subscriptions/checkout', { planId: 'BUSINESS' }).expect(400);
  await get('/subscriptions/qris').expect(404);
  await get('/reports/revenue').expect(403);
  const customer = (
    await post('/customers', { name: 'Test Customer', type: 'PERSON' }).expect(
      201,
    )
  ).body.data;
  const invoice = (
    await post('/invoices', {
      customerId: customer.id,
      issueDate: '2099-01-01',
      dueDate: '2099-01-08',
      items: [{ name: 'Service', quantity: 1, unitPrice: 100000 }],
    }).expect(201)
  ).body.data;
  const freePdf = await get('/invoices/' + invoice.id + '/pdf').expect(200);
  assert.equal(freePdf.body.subarray(0, 4).toString(), '%PDF');
  assert.equal(
    (freePdf.body.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length,
    1,
    'One invoice should not produce blank footer pages',
  );
  const payment = (
    await post('/subscriptions/checkout', { planId: 'PRO' }).expect(201)
  ).body.data;
  assert.equal(payment.amount, 129000);
  assert.equal((await get('/subscriptions/current')).body.data.planId, 'FREE');
  // Over 100 KB: exercises the proof route's body parser before Nest's default.
  const image = Buffer.alloc(200000);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
  await post('/subscriptions/payments/' + payment.id + '/proof', {
    content: image.toString('base64'),
  }).expect(201);
  assert.equal((await get('/subscriptions/current')).body.data.planId, 'FREE');
  await request(server)
    .get('/api/v1/subscriptions/admin/' + payment.id + '/proof')
    .expect(401);
  const login = await request(server)
    .post('/api/v1/subscriptions/admin/login')
    .type('form')
    .send({ email: 'review@example.com', password: 'test-only-admin-password' })
    .expect(303);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  const details = await request(server)
    .get('/api/v1/subscriptions/admin/' + payment.id)
    .set('Cookie', cookie)
    .expect(200);
  const csrf = /name="csrf" value="([a-z0-9]+)"/.exec(details.text)?.[1];
  assert.ok(csrf);
  await request(server)
    .post('/api/v1/subscriptions/admin/' + payment.id + '/review')
    .set('Cookie', cookie)
    .type('form')
    .send({ decision: 'approve', csrf: 'wrong', reason: '' })
    .expect(401);
  await request(server)
    .post('/api/v1/subscriptions/admin/' + payment.id + '/review')
    .set('Cookie', cookie)
    .type('form')
    .send({ decision: 'approve', csrf, reason: '' })
    .expect(303);
  const pro = (await get('/subscriptions/current').expect(200)).body.data;
  assert.equal(pro.planId, 'PRO');
  assert.equal(pro.billingMode, 'demo');
  assert.equal(pro.invoiceLimit, null);
  await get('/reports/revenue').expect(200);
  const logo =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5lAAAAAASUVORK5CYII=';
  await request(server)
    .patch('/api/v1/business')
    .auth(token, { type: 'bearer' })
    .send({ logo })
    .expect(200);
  const brandedPdf = await get('/invoices/' + invoice.id + '/pdf').expect(200);
  assert.ok(
    brandedPdf.body.toString('latin1').includes('/Subtype /Image'),
    'Pro logo is embedded in the PDF',
  );
  console.log(
    'PASS: full Nest application, auth, DTO validation, private proof upload, admin login/CSRF, approval and Pro reports. All data and mail are isolated.',
  );
} finally {
  if (app) await app.close();
  if (mongo) await mongo.stop();
  if (redisStarted)
    execFileSync('docker', ['stop', container], { stdio: 'pipe' });
}
