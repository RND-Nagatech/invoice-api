import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import { Types } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter.js';
import { ApiResponseInterceptor } from '../src/common/interceptors/api-response.interceptor.js';
import type {
  AuthResponse,
  TokenPair,
} from '../src/modules/auth/interfaces/auth-user.interface.js';

describe('auth API with MongoDB and Redis', () => {
  let app: INestApplication;
  let connection: Connection;
  let originalFetch: typeof fetch;
  let lastOtp: string | undefined;
  const previousResendKey = process.env.RESEND_API_KEY;
  const previousResendFrom = process.env.RESEND_FROM_EMAIL;
  const created: Array<{ userId: Types.ObjectId; businessId: Types.ObjectId }> =
    [];

  beforeAll(async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'InvoiceKilat <no-reply@example.com>';
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).includes('api.resend.com/emails')) {
        const payload = JSON.parse(String(init?.body ?? '{}')) as {
          text?: string;
        };
        lastOtp = /\b(\d{6})\b/.exec(payload.text ?? '')?.[1];
        return new Response(JSON.stringify({ id: 'test-email' }), {
          status: 200,
        });
      }
      return originalFetch(input, init);
    };
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
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
    connection = app.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    const db = connection?.db;
    if (db && created.length > 0) {
      const userIds = created.map((item) => item.userId);
      const businessIds = created.map((item) => item.businessId);
      await Promise.all([
        db
          .collection('refresh_sessions')
          .deleteMany({ userId: { $in: userIds } }),
        db.collection('users').deleteMany({ _id: { $in: userIds } }),
        db.collection('businesses').deleteMany({ _id: { $in: businessIds } }),
      ]);
    }
    await app?.close();
    globalThis.fetch = originalFetch;
    if (previousResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousResendKey;
    if (previousResendFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = previousResendFrom;
  });

  it('registers, isolates tenants, rotates tokens, logs out, and resets a password', async () => {
    const suffix = randomUUID().slice(0, 8);
    const emailA = `auth-a-${suffix}@invoicekilat.local`;
    const emailB = `auth-b-${suffix}@invoicekilat.local`;
    const oldPassword = 'ValidPass123!';
    const newPassword = 'FreshPass456!';

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Ayu',
        businessName: 'Studio Ayu',
        email: emailA,
        password: oldPassword,
        unexpected: true,
      })
      .expect(400);

    const registrationA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Ayu',
        businessName: 'Studio Ayu',
        email: emailA,
        password: oldPassword,
      })
      .expect(201);
    const accountA = registrationA.body.data as AuthResponse;
    created.push({
      userId: new Types.ObjectId(accountA.user.id),
      businessId: new Types.ObjectId(accountA.user.businessId),
    });
    expect(accountA.user.businessName).toBe('Studio Ayu');
    expect(registrationA.body.data.user.passwordHash).toBeUndefined();

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Ayu',
        businessName: 'Studio Ayu',
        email: emailA,
        password: oldPassword,
      })
      .expect(409);

    const registrationB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Budi',
        businessName: 'Budi Jasa',
        email: emailB,
        password: oldPassword,
      })
      .expect(201);
    const accountB = registrationB.body.data as AuthResponse;
    created.push({
      userId: new Types.ObjectId(accountB.user.id),
      businessId: new Types.ObjectId(accountB.user.businessId),
    });

    const meA = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accountA.accessToken}`)
      .expect(200);
    expect(meA.body.data.id).toBe(accountA.user.id);
    expect(meA.body.data.businessId).not.toBe(accountB.user.businessId);

    const jwt = app.get(JwtService);
    const claims = jwt.decode(accountA.accessToken) as Record<string, unknown>;
    const forged = await jwt.signAsync({
      sub: accountA.user.id,
      businessId: accountB.user.businessId,
      sid: claims.sid,
      typ: 'access',
    });
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);

    const rotation = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: accountA.refreshToken })
      .expect(200);
    const rotated = rotation.body.data as TokenPair;
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: accountA.refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${rotated.accessToken}`)
      .send({ refreshToken: rotated.refreshToken })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${rotated.accessToken}`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: emailA })
      .expect(200);
    for (let attempt = 0; attempt < 25 && !lastOtp; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(lastOtp).toMatch(/^\d{6}$/);
    const verification = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-reset-otp')
      .send({ email: emailA, otp: lastOtp })
      .expect(200);
    const resetToken = verification.body.data.resetToken as string;
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ resetToken, newPassword })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ resetToken, newPassword })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailA, password: oldPassword })
      .expect(401);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailA, password: newPassword })
      .expect(200);
    expect(login.body.data.user.id).toBe(accountA.user.id);
  }, 30_000);
});
