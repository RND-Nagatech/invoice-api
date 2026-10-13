import { ForbiddenException } from '@nestjs/common';
import { DelayedError, type Job } from 'bullmq';
import type { ResendMailService } from '../auth/email/resend-mail.service.js';
import type { CustomerRepository } from '../customers/repository/customer.repository.js';
import type { InvoiceRepository } from '../invoices/repository/invoice.repository.js';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import type { ReminderRepository } from './repository/reminder.repository.js';
import { ReminderWorker } from './reminder.worker.js';

describe('Scheduled reminder delivery', () => {
  const job = {
    data: { id: 'reminder-id', businessId: 'business-id' },
  } as Job<{ id: string; businessId: string }>;
  let reminders: {
    findById: ReturnType<typeof vi.fn>;
    transition: ReturnType<typeof vi.fn>;
  };
  let invoices: { findById: ReturnType<typeof vi.fn> };
  let mail: { sendReminder: ReturnType<typeof vi.fn> };
  let subscriptions: { assertFeature: ReturnType<typeof vi.fn> };
  let worker: ReminderWorker;
  beforeEach(() => {
    reminders = {
      findById: vi.fn().mockResolvedValue({
        status: 'SCHEDULED',
        invoiceId: 'invoice',
        message: 'Mohon dibayar',
      }),
      transition: vi.fn(),
    };
    invoices = {
      findById: vi.fn().mockResolvedValue({
        status: 'SENT',
        customerId: 'customer',
        invoiceNumber: 'INV-001',
        total: 100000,
        paidAmount: 25000,
        dueDate: new Date('2099-01-01'),
      }),
    };
    mail = { sendReminder: vi.fn() };
    subscriptions = { assertFeature: vi.fn() };
    worker = new ReminderWorker(
      reminders as unknown as ReminderRepository,
      invoices as unknown as InvoiceRepository,
      {
        findById: async () => ({ email: 'customer@example.com' }),
      } as unknown as CustomerRepository,
      mail as unknown as ResendMailService,
      subscriptions as unknown as SubscriptionsService,
    );
  });
  it('sends the actual outstanding amount to the customer with a stable idempotency key', async () => {
    await worker.process(job);
    expect(mail.sendReminder).toHaveBeenCalledWith(
      'customer@example.com',
      'Pengingat INV-001',
      expect.stringContaining('75.000'),
      'reminder-reminder-id',
    );
    expect(reminders.transition).toHaveBeenCalledWith(
      'business-id',
      'reminder-id',
      'SENT',
    );
  });
  it('does not resend an already completed reminder', async () => {
    reminders.findById.mockResolvedValue({ status: 'SENT' });
    await worker.process(job);
    expect(mail.sendReminder).not.toHaveBeenCalled();
  });
  it('defers an existing reminder until the promised date without treating it as failed', async () => {
    const promise = new Date(Date.now() + 86400000);
    invoices.findById.mockResolvedValue({
      status: 'SENT',
      promisedPaymentDate: promise,
    });
    const moveToDelayed = vi.fn().mockResolvedValue(undefined);
    const delayedJob = {
      data: job.data,
      token: 'worker-lock',
      moveToDelayed,
    } as unknown as Job<{ id: string; businessId: string }>;
    await expect(worker.process(delayedJob)).rejects.toBeInstanceOf(
      DelayedError,
    );
    expect(moveToDelayed).toHaveBeenCalledWith(
      promise.getTime(),
      'worker-lock',
    );
    expect(mail.sendReminder).not.toHaveBeenCalled();
    expect(reminders.transition).not.toHaveBeenCalled();
  });
  it('cancels reminders for invoices already paid', async () => {
    invoices.findById.mockResolvedValue({ status: 'PAID' });
    await worker.process(job);
    expect(mail.sendReminder).not.toHaveBeenCalled();
    expect(reminders.transition).toHaveBeenCalledWith(
      'business-id',
      'reminder-id',
      'CANCELLED',
    );
  });
  it('cancels pending delivery when Pro has expired', async () => {
    subscriptions.assertFeature.mockRejectedValue(new ForbiddenException());
    await worker.process(job);
    expect(mail.sendReminder).not.toHaveBeenCalled();
    expect(reminders.transition).toHaveBeenCalledWith(
      'business-id',
      'reminder-id',
      'CANCELLED',
    );
  });
  it('retains a scheduled reminder for retry if the provider fails', async () => {
    mail.sendReminder.mockRejectedValue(new Error('provider down'));
    await expect(worker.process(job)).rejects.toThrow();
    expect(reminders.transition).not.toHaveBeenCalled();
  });
});
