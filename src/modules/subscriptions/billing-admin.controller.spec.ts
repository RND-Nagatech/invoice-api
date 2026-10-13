import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { createHmac } from 'node:crypto';
import { BillingAdminController } from './billing-admin.controller.js';
import type { BillingService } from './billing.service.js';

describe('Billing owner authentication and review forms', () => {
  const settings = {
    JWT_ACCESS_SECRET: 'test-only-secret'.repeat(3),
    BILLING_REVIEW_EMAIL: 'owner@example.com',
    BILLING_ADMIN_PASSWORD: 'test-admin-password-only',
    NODE_ENV: 'development',
  };
  const jwt = new JwtService();
  let review: ReturnType<typeof vi.fn>;
  let controller: BillingAdminController;
  function response() {
    const res = {
      cookie: vi.fn(),
      redirect: vi.fn(),
      setHeader: vi.fn(),
      type: vi.fn(),
      send: vi.fn(),
      status: vi.fn(),
    };
    for (const name of ['type', 'send', 'status'] as const)
      res[name].mockReturnValue(res);
    return res;
  }
  beforeEach(() => {
    review = vi.fn().mockResolvedValue({ status: 'APPROVED' });
    controller = new BillingAdminController(
      { review } as unknown as BillingService,
      new ConfigService(settings),
      jwt,
    );
  });
  it('rejects wrong admin credentials without issuing a session', async () => {
    const res = response();
    await controller.login(
      { email: settings.BILLING_REVIEW_EMAIL, password: 'wrong' },
      res as unknown as Response,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.cookie).not.toHaveBeenCalled();
  });
  it('issues an HttpOnly scoped session and approves only with its CSRF token', async () => {
    const res = response();
    await controller.login(
      {
        email: settings.BILLING_REVIEW_EMAIL,
        password: settings.BILLING_ADMIN_PASSWORD,
      },
      res as unknown as Response,
    );
    const [name, token, options] = res.cookie.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      path: '/api/v1/subscriptions/admin',
    });
    const req = { headers: { cookie: `${name}=${token}` } } as Request;
    const csrf = jwt.decode<{ csrf: string }>(token).csrf;
    await expect(
      controller.review(
        req,
        'payment-id',
        { decision: 'approve', reason: '', csrf: 'forged' },
        res as unknown as Response,
      ),
    ).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
    await controller.review(
      req,
      'payment-id',
      { decision: 'approve', reason: '', csrf },
      res as unknown as Response,
    );
    expect(review).toHaveBeenCalledOnce();
  });
  it('does not accept a normal application user token as an admin session', async () => {
    const token = await jwt.signAsync(
      { typ: 'access', sub: 'owner' },
      { secret: settings.JWT_ACCESS_SECRET },
    );
    await expect(
      controller.review(
        {
          headers: { cookie: 'invoicekilat_billing_admin=' + token },
        } as Request,
        'id',
        { decision: 'approve', reason: '', csrf: 'anything' },
        response() as unknown as Response,
      ),
    ).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
  });
  it('blocks expired admin sessions and unauthenticated proof access', async () => {
    const secret = createHmac('sha256', settings.JWT_ACCESS_SECRET)
      .update('billing-admin-session')
      .digest('hex');
    const token = await jwt.signAsync(
      { typ: 'billing-admin', csrf: 'old' },
      { secret, audience: 'billing-admin', expiresIn: -1 },
    );
    await expect(
      controller.review(
        {
          headers: { cookie: 'invoicekilat_billing_admin=' + token },
        } as Request,
        'id',
        { decision: 'approve', reason: '', csrf: 'old' },
        response() as unknown as Response,
      ),
    ).rejects.toThrow();
    await expect(
      controller.proof(
        { headers: {} } as Request,
        'id',
        response() as unknown as Response,
      ),
    ).rejects.toThrow();
  });
});
