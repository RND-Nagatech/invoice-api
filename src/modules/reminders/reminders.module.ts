import { BullModule } from '@nestjs/bullmq';
import { ReminderWorker } from './reminder.worker.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { CommercialModule } from '../invoices/commercial.module.js';
import { ReminderRepository } from './repository/reminder.repository.js';
import { Reminder, ReminderSchema } from './schemas/reminder.schema.js';
import { RemindersController } from './reminders.controller.js';
import { RemindersService } from './reminders.service.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'invoice-reminders' }),
    SubscriptionsModule,
    AuthModule,
    CommercialModule,
    MongooseModule.forFeature([
      { name: Reminder.name, schema: ReminderSchema },
    ]),
  ],
  controllers: [RemindersController],
  providers: [RemindersService, ReminderRepository, ReminderWorker],
})
export class RemindersModule {}
