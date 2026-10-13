import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Business, BusinessDocument } from '../schemas/business.schema.js';

@Injectable()
export class BusinessRepository {
  constructor(
    @InjectModel(Business.name) private readonly businesses: Model<Business>,
  ) {}

  create(
    id: Types.ObjectId,
    ownerId: Types.ObjectId,
    name: string,
  ): Promise<BusinessDocument> {
    return this.businesses.create({ _id: id, ownerId, name });
  }

  findById(id: Types.ObjectId): Promise<BusinessDocument | null> {
    return this.businesses.findById(id).exec();
  }

  updateById(
    id: Types.ObjectId,
    input: Record<string, unknown>,
  ): Promise<BusinessDocument | null> {
    return this.businesses
      .findByIdAndUpdate(
        id,
        { $set: input },
        { new: true, runValidators: true },
      )
      .exec();
  }

  async deleteById(id: Types.ObjectId): Promise<void> {
    await this.businesses.deleteOne({ _id: id }).exec();
  }
}
