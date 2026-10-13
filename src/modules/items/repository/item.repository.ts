import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type {
  CreateItemDto,
  ItemQueryDto,
  UpdateItemDto,
} from '../dto/item.dto.js';
import { Item, ItemDocument } from '../schemas/item.schema.js';

@Injectable()
export class ItemRepository {
  constructor(@InjectModel(Item.name) private readonly items: Model<Item>) {}

  async list(businessId: string, query: ItemQueryDto) {
    const filter: Record<string, unknown> = { businessId };
    if (query.category) filter.category = query.category;
    if (query.active !== undefined) filter.active = query.active;
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
        { category: { $regex: escaped, $options: 'i' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.items
        .find(filter)
        .sort({ active: -1, name: 1, _id: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.items.countDocuments(filter).exec(),
    ]);
    return { rows, total };
  }

  findById(businessId: string, id: string): Promise<ItemDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.items.findOne({ _id: id, businessId }).exec();
  }

  create(businessId: string, input: CreateItemDto): Promise<ItemDocument> {
    return this.items.create({
      businessId,
      name: input.name,
      description: input.description ?? '',
      unit: input.unit || 'unit',
      defaultPrice: input.defaultPrice,
      tax: input.tax ?? 0,
      category: input.category ?? '',
      active: input.active ?? true,
    });
  }

  update(
    businessId: string,
    id: string,
    input: UpdateItemDto,
  ): Promise<ItemDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.items
      .findOneAndUpdate(
        { _id: id, businessId },
        { $set: input },
        { new: true, runValidators: true },
      )
      .exec();
  }

  async delete(businessId: string, id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.items.deleteOne({ _id: id, businessId }).exec();
    return result.deletedCount === 1;
  }
}
