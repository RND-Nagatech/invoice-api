import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '../schemas/customer.schema.js';
import type {
  CreateCustomerDto,
  CustomerQueryDto,
  UpdateCustomerDto,
} from '../dto/customer.dto.js';

@Injectable()
export class CustomerRepository {
  constructor(
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
  ) {}

  async list(businessId: string, query: CustomerQueryDto) {
    const filter: Record<string, unknown> = { businessId };
    if (query.type) filter.type = query.type;
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { companyName: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { phone: { $regex: escaped, $options: 'i' } },
        { address: { $regex: escaped, $options: 'i' } },
        { city: { $regex: escaped, $options: 'i' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.customers
        .find(filter)
        .sort(
          query.sort === 'CREATED_ASC'
            ? { createdAt: 1, _id: 1 }
            : { createdAt: -1, _id: -1 },
        )
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.customers.countDocuments(filter).exec(),
    ]);
    return { rows, total };
  }

  findById(businessId: string, id: string): Promise<CustomerDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.customers.findOne({ _id: id, businessId }).exec();
  }

  create(
    businessId: string,
    input: CreateCustomerDto,
  ): Promise<CustomerDocument> {
    return this.customers.create({
      businessId,
      name: input.name,
      type: input.type,
      companyName: input.companyName ?? '',
      phone: input.phone ?? '',
      email: input.email ?? '',
      address: input.address ?? '',
      city: input.city ?? '',
      npwp: input.npwp ?? '',
      paymentTermsDays: input.paymentTermsDays ?? 7,
    });
  }

  update(
    businessId: string,
    id: string,
    input: UpdateCustomerDto,
  ): Promise<CustomerDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.customers
      .findOneAndUpdate(
        { _id: id, businessId },
        { $set: input },
        { new: true, runValidators: true },
      )
      .exec();
  }

  async delete(businessId: string, id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.customers
      .deleteOne({ _id: id, businessId })
      .exec();
    return result.deletedCount === 1;
  }
}
