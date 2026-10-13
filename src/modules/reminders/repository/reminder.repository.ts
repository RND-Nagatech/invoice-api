import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Reminder, ReminderDocument } from '../schemas/reminder.schema.js';

@Injectable()
export class ReminderRepository {
  constructor(
    @InjectModel(Reminder.name) private readonly reminders: Model<Reminder>,
  ) {}
  list(businessId: string, limit: number) {
    return this.reminders
      .find({ businessId })
      .sort({ remindAt: 1 })
      .limit(limit)
      .exec();
  }
  findById(businessId: string, id: string): Promise<ReminderDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.reminders.findOne({ _id: id, businessId }).exec();
  }
  scheduled() {
    return this.reminders
      .find({ status: 'SCHEDULED', channel: 'EMAIL' })
      .limit(1000)
      .exec();
  }
  delete(id: string) {
    return this.reminders.deleteOne({ _id: id }).exec();
  }
  create(input: Record<string, unknown>): Promise<ReminderDocument> {
    return this.reminders.create(input);
  }
  transition(
    businessId: string,
    id: string,
    status: 'SENT' | 'CANCELLED' | 'FAILED',
  ) {
    return this.reminders
      .findOneAndUpdate(
        { _id: id, businessId, status: 'SCHEDULED' },
        { $set: { status, sentAt: status === 'SENT' ? new Date() : null } },
        { new: true },
      )
      .exec();
  }
}
