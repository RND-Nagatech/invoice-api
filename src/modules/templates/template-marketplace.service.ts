import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { ConflictException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { TemplatePurchaseRepository } from './repository/template-purchase.repository.js';
import { TemplatesService } from './templates.service.js';

@Injectable()
export class TemplateMarketplaceService {
  constructor(
    private readonly templates: TemplatesService,
    private readonly purchases: TemplatePurchaseRepository,
    private readonly subscriptions: SubscriptionsService,
  ) {}
  marketplace(category?: string, profession?: string) {
    return this.templates
      .list(category)
      .filter(
        (template) =>
          !profession ||
          template.profession.toLowerCase() === profession.toLowerCase(),
      );
  }
  async purchase(user: AuthenticatedPrincipal, templateId: string) {
    const template = this.templates.get(templateId);
    if (template.accessTier === 'PRO') await this.subscriptions.assertFeature(user.businessId, 'templates');
    const existing = await this.purchases.find(user.businessId, templateId);
    if (existing)
      throw new ConflictException('Template sudah dimiliki bisnis ini.');
    const row = await this.purchases.create({
      businessId: new Types.ObjectId(user.businessId),
      templateId,
      version: template.version,
      purchasedAt: new Date(),
    });
    return {
      id: row.id,
      templateId: row.templateId,
      version: row.version,
      purchasedAt: row.purchasedAt,
      template,
    };
  }
  async owned(user: AuthenticatedPrincipal) {
    return { items: await this.purchases.list(user.businessId) };
  }
}
