import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema.js';

@Injectable()
export class UserRepository {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.users.findOne({ email }).select('+passwordHash').exec();
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.users.findOne({ email }).exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.users.findById(id).exec();
  }

  async create(input: {
    id: Types.ObjectId;
    name: string;
    email: string;
    passwordHash: string;
    businessId: Types.ObjectId;
  }): Promise<UserDocument> {
    return this.users.create({
      _id: input.id,
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      businessId: input.businessId,
      role: 'owner',
    });
  }

  async updatePassword(
    id: Types.ObjectId,
    passwordHash: string,
  ): Promise<void> {
    await this.users.updateOne({ _id: id }, { $set: { passwordHash } }).exec();
  }
}
