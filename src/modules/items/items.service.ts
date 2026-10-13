import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import type {
  CreateItemDto,
  ItemQueryDto,
  UpdateItemDto,
} from './dto/item.dto.js';
import { ItemRepository } from './repository/item.repository.js';
import type { ItemDocument } from './schemas/item.schema.js';

@Injectable()
export class ItemsService {
  constructor(private readonly items: ItemRepository) {}

  private output(row: ItemDocument) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      unit: row.unit,
      defaultPrice: row.defaultPrice,
      tax: row.tax,
      category: row.category,
      active: row.active,
    };
  }

  async list(user: AuthenticatedPrincipal, query: ItemQueryDto) {
    const { rows, total } = await this.items.list(user.businessId, query);
    return {
      items: rows.map((row) => this.output(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async get(user: AuthenticatedPrincipal, id: string) {
    const row = await this.items.findById(user.businessId, id);
    if (!row) throw new NotFoundException('Item tidak ditemukan.');
    return this.output(row);
  }

  async create(user: AuthenticatedPrincipal, dto: CreateItemDto) {
    return this.output(await this.items.create(user.businessId, dto));
  }

  async update(user: AuthenticatedPrincipal, id: string, dto: UpdateItemDto) {
    const row = await this.items.update(user.businessId, id, dto);
    if (!row) throw new NotFoundException('Item tidak ditemukan.');
    return this.output(row);
  }

  async delete(user: AuthenticatedPrincipal, id: string) {
    await this.get(user, id);
    if (!(await this.items.delete(user.businessId, id)))
      throw new NotFoundException('Item tidak ditemukan.');
    return { deleted: true };
  }
}
