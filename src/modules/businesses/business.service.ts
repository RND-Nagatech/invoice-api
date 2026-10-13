import { decodeLogo } from '../../common/utils/image.js';
import { TemplatesService } from '../templates/templates.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { BusinessRepository } from './repository/business.repository.js';
import type { BusinessDocument } from './schemas/business.schema.js';
import type { UpdateBusinessDto } from './dto/business.dto.js';

@Injectable()
export class BusinessService {
  constructor(
    private readonly businesses: BusinessRepository,
    private readonly subscriptions: SubscriptionsService,
    private readonly templates: TemplatesService,
  ) {}

  private output(row: BusinessDocument) {
    return {
      id: row.id,
      name: row.name,
      logo: row.logo,
      address: row.address,
      phone: row.phone,
      email: row.email,
      website: row.website,
      npwp: row.npwp,
      qris: row.qris,
      bankAccounts: row.bankAccounts,
      defaultTemplate: row.defaultTemplate,
      defaultDueDate: row.defaultDueDate,
      defaultFooter: row.defaultFooter,
      brandColor: row.brandColor,
      secondaryColor: row.secondaryColor,
      fontPreset: row.fontPreset,
    };
  }

  private async find(user: AuthenticatedPrincipal): Promise<BusinessDocument> {
    const row = await this.businesses.findById(
      new Types.ObjectId(user.businessId),
    );
    if (!row || row.ownerId.toString() !== user.id) {
      throw new NotFoundException('Profil bisnis tidak ditemukan.');
    }
    return row;
  }

  async get(user: AuthenticatedPrincipal) {
    return this.output(await this.find(user));
  }

  async update(user: AuthenticatedPrincipal, dto: UpdateBusinessDto) {
    const current = await this.find(user);
    if (dto.logo && dto.logo !== current.logo) {
      await this.subscriptions.assertFeature(user.businessId, 'logo');
      decodeLogo(dto.logo);
    }
    if (
      dto.defaultTemplate &&
      dto.defaultTemplate !== current.defaultTemplate
    ) {
      if (this.templates.get(dto.defaultTemplate).accessTier === 'PRO')
        await this.subscriptions.assertFeature(user.businessId, 'templates');
    }
    const row = await this.businesses.updateById(
      current._id,
      dto as Record<string, unknown>,
    );
    if (!row) throw new NotFoundException('Profil bisnis tidak ditemukan.');
    return this.output(row);
  }
}
