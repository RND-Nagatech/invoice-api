import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RefreshSession } from '../schemas/refresh-session.schema.js';

@Injectable()
export class SessionRepository {
  constructor(
    @InjectModel(RefreshSession.name)
    private readonly sessions: Model<RefreshSession>,
  ) {}

  async create(input: {
    id: Types.ObjectId;
    userId: Types.ObjectId;
    businessId: Types.ObjectId;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.sessions.create({
      _id: input.id,
      userId: input.userId,
      businessId: input.businessId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
    });
  }

  async isActive(id: string, userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const session = await this.sessions.exists({
      _id: id,
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    return session !== null;
  }

  async rotate(
    id: string,
    userId: string,
    oldHash: string,
    newHash: string,
    expiresAt: Date,
  ): Promise<boolean> {
    const result = await this.sessions
      .updateOne(
        {
          _id: id,
          userId,
          tokenHash: oldHash,
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        },
        { $set: { tokenHash: newHash, expiresAt } },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  async revoke(
    id: string,
    userId: string,
    tokenHash: string,
  ): Promise<boolean> {
    const result = await this.sessions
      .updateOne(
        { _id: id, userId, tokenHash, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  async revokeAll(userId: Types.ObjectId): Promise<void> {
    await this.sessions
      .updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
  }
}
