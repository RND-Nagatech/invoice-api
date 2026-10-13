import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { CustomerRepository } from '../customers/repository/customer.repository.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import {
  BadRequestException,
  ConflictException,
  Logger,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { InvoiceRepository } from '../invoices/repository/invoice.repository.js';
import type {
  CreateReminderDto,
  ReminderQueryDto,
} from './dto/reminder.dto.js';
import { ReminderRepository } from './repository/reminder.repository.js';
import type { ReminderDocument } from './schemas/reminder.schema.js';

@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(RemindersService.name);
  private async enqueue(id: string, businessId: string, at: Date) {
    await this.queue.add(
      'deliver',
      { id, businessId },
      {
        jobId: 'reminder-' + id,
        delay: Math.max(0, at.getTime() - Date.now()),
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
      },
    );
  }
  async recover() {
    try {
      for (const row of await this.reminders.scheduled())
        await this.enqueue(row.id, row.businessId.toString(), row.remindAt);
    } catch {
      this.logger.warn(
        'Reminder queue unavailable; scheduled reminders will be retried.',
      );
    }
  }
  onModuleInit() {
    void this.recover();
    this.timer = setInterval(() => {
      void this.recover();
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  constructor(
    private readonly reminders: ReminderRepository,
    private readonly invoices: InvoiceRepository,
    private readonly subscriptions: SubscriptionsService,
    private readonly customers: CustomerRepository,
    @InjectQueue('invoice-reminders') private readonly queue: Queue,
  ) {}
  private output(row: ReminderDocument) {
    return {
      id: row.id,
      invoiceId: row.invoiceId.toString(),
      remindAt: row.remindAt,
      channel: row.channel,
      status: row.status,
      sentAt: row.sentAt,
      message: row.message,
    };
  }
  async list(user: AuthenticatedPrincipal, query: ReminderQueryDto) {
    return {
      items: (await this.reminders.list(user.businessId, query.limit)).map(
        (row) => this.output(row),
      ),
    };
  }
  async create(user: AuthenticatedPrincipal, dto: CreateReminderDto) {
    await this.subscriptions.assertFeature(user.businessId, 'reminders');
    const invoice = await this.invoices.findById(
      user.businessId,
      dto.invoiceId,
    );
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    if (['PAID', 'VOID', 'CANCELLED'].includes(invoice.status))
      throw new BadRequestException('Invoice sudah selesai atau dibatalkan.');
    if (new Date(dto.remindAt).getTime() <= Date.now())
      throw new BadRequestException('Pilih waktu pengingat setelah sekarang.');
    const customer = await this.customers.findById(
      user.businessId,
      invoice.customerId.toString(),
    );
    if (!customer?.email)
      throw new BadRequestException('Isi email pelanggan terlebih dahulu.');
    const row = await this.reminders.create({
      businessId: new Types.ObjectId(user.businessId),
      invoiceId: invoice._id,
      remindAt: new Date(dto.remindAt),
      channel: dto.channel,
      message: dto.message ?? '',
    });
    try {
      await this.enqueue(row.id, user.businessId, row.remindAt);
    } catch (error) {
      await this.reminders.delete(row.id);
      throw error;
    }
    return this.output(row);
  }
  async mark(user: AuthenticatedPrincipal, id: string, status: 'CANCELLED') {
    const row = await this.reminders.transition(user.businessId, id, status);
    if (!row) throw new ConflictException('Reminder tidak dapat diubah.');
    return this.output(row);
  }
}
