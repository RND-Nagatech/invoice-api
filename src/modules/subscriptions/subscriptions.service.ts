import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ClientSession } from 'mongoose';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { SubscriptionRepository } from './repository/subscription.repository.js';
import type { SubscriptionDocument } from './schemas/subscription.schema.js';

export const FREE_LIMITS = { invoices: 10, customers: 20 } as const;
export type ProFeature =
  'templates' | 'voice' | 'logo' | 'reminders' | 'reports';
export function isActivePro(
  row: Pick<
    SubscriptionDocument,
    'planId' | 'status' | 'periodEnd' | 'billingMode'
  >,
  now = new Date(),
  mode?: string,
) {
  return (
    row.planId === 'PRO' &&
    row.status === 'ACTIVE' &&
    row.periodEnd > now &&
    (!mode || row.billingMode === mode)
  );
}
export function addCalendarMonth(start: Date): Date {
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly config: ConfigService,
  ) {}
  plans() {
    return [
      {
        id: 'FREE',
        name: 'Free',
        price: 0,
        maxInvoices: 10,
        maxCustomers: 20,
        features: [],
      },
      {
        id: 'PRO',
        name: 'Pro',
        price: Number(this.config.get('SUBSCRIPTION_PRO_PRICE') ?? 129000),
        maxInvoices: null,
        maxCustomers: null,
        features: ['templates', 'voice', 'logo', 'reminders', 'reports'],
      },
    ];
  }
  private mode(): 'demo' | 'manual' {
    return (
      this.config.get<'demo' | 'manual'>('SUBSCRIPTION_PAYMENT_MODE') ?? 'demo'
    );
  }
  private active(row: SubscriptionDocument, now = new Date()) {
    return isActivePro(row, now, this.mode());
  }
  private async ensure(businessId: string) {
    return this.subscriptions.ensure(businessId);
  }
  private output(row: SubscriptionDocument) {
    const pro = this.active(row);
    return {
      id: row.id,
      billingMode: pro ? row.billingMode : null,
      planId: pro ? 'PRO' : 'FREE',
      status: 'ACTIVE',
      expired: row.planId === 'PRO' && !pro,
      periodStart: pro ? row.periodStart : null,
      periodEnd: pro ? row.periodEnd : null,
      invoiceCount: row.invoiceCount,
      customerCount: row.customerCount,
      invoiceLimit: pro ? null : 10,
      customerLimit: pro ? null : 20,
      features: {
        templates: pro,
        voice: pro,
        logo: pro,
        reminders: pro,
        reports: pro,
      },
      plan: this.plans()[pro ? 1 : 0],
    };
  }
  async current(user: AuthenticatedPrincipal) {
    return this.output(await this.ensure(user.businessId));
  }
  async usage(user: AuthenticatedPrincipal) {
    return this.current(user);
  }
  async assertFeature(businessId: string, feature: ProFeature) {
    if (!this.active(await this.ensure(businessId))) {
      const names = {
        templates: 'Template Pro',
        voice: 'Speech to text',
        logo: 'Logo bisnis',
        reminders: 'Pengingat pembayaran',
        reports: 'Laporan pemasukan',
      };
      throw new ForbiddenException({
        code: 'PRO_REQUIRED',
        message:
          names[feature] + ' tersedia di paket Pro. Silakan berlangganan.',
        details: { feature, upgradePath: '/subscription' },
      });
    }
  }
  async assertCanCreateInvoice(businessId: string) {
    const row = await this.ensure(businessId);
    if (!this.active(row) && row.invoiceCount >= 10) this.limitError('invoice');
  }
  private limitError(kind: 'invoice' | 'customer'): never {
    throw new ForbiddenException({
      code: 'SUBSCRIPTION_LIMIT',
      message:
        kind === 'invoice'
          ? 'Batas 10 invoice paket Free sudah tercapai. Berlangganan Pro untuk membuat invoice tanpa batas.'
          : 'Batas 20 pelanggan paket Free sudah tercapai. Berlangganan Pro untuk menambah pelanggan tanpa batas.',
      details: { kind, upgradePath: '/subscription' },
    });
  }
  async reserve(businessId: string, kind: 'invoice' | 'customer') {
    await this.ensure(businessId);
    if (!(await this.subscriptions.reserve(businessId, kind, this.mode())))
      this.limitError(kind);
  }
  release(businessId: string, kind: 'invoice' | 'customer') {
    return this.subscriptions.release(businessId, kind);
  }
  async cancel(user: AuthenticatedPrincipal) {
    // No automatic charge: keep access until the paid period ends.
    return { ...(await this.current(user)), autoRenew: false };
  }
  async activate(
    businessId: string,
    session: ClientSession,
    mode: 'demo' | 'manual',
  ) {
    const row = await this.subscriptions.findByBusinessId(businessId, session);
    if (!row) throw new ForbiddenException('Langganan belum tersedia.');
    const start = new Date();
    const base = this.active(row, start) ? row.periodEnd : start;
    await this.subscriptions.activate(
      businessId,
      start,
      addCalendarMonth(base),
      session,
      mode,
    );
  }
}
