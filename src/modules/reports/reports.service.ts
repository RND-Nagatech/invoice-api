import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import type { ReportQueryDto } from './dto/report.dto.js';
import { ReportsRepository } from './repository/reports.repository.js';

@Injectable()
export class ReportsService {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly subscriptions: SubscriptionsService,
  ) {}
  private range(query: ReportQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    let from: Date;
    if (query.from) {
      from = new Date(query.from);
    } else if (query.period === 'daily') {
      from = new Date(
        Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
      );
    } else if (query.period === 'weekly') {
      const day = to.getUTCDay();
      const daysFromMonday = day === 0 ? 6 : day - 1;
      from = new Date(
        Date.UTC(
          to.getUTCFullYear(),
          to.getUTCMonth(),
          to.getUTCDate() - daysFromMonday,
        ),
      );
    } else {
      from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    }
    to.setUTCHours(23, 59, 59, 999);
    return { from, to };
  }
  async revenue(user: AuthenticatedPrincipal, query: ReportQueryDto) {
    await this.subscriptions.assertFeature(user.businessId, 'reports');
    const { from, to } = this.range(query);
    return this.reports.revenue(user.businessId, from, to, query.period);
  }
  async invoices(user: AuthenticatedPrincipal, query: ReportQueryDto) {
    await this.subscriptions.assertFeature(user.businessId, 'reports');
    const { from, to } = this.range(query);
    return this.reports.invoiceStatus(user.businessId, from, to);
  }
  async outstanding(user: AuthenticatedPrincipal) {
    await this.subscriptions.assertFeature(user.businessId, 'reports');
    return this.reports.outstanding(user.businessId);
  }
  async customers(user: AuthenticatedPrincipal) {
    await this.subscriptions.assertFeature(user.businessId, 'reports');
    return this.reports.topCustomers(user.businessId);
  }
}
