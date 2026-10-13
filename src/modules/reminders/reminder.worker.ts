import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { DelayedError, type Job } from 'bullmq';
import { ResendMailService } from '../auth/email/resend-mail.service.js';
import { CustomerRepository } from '../customers/repository/customer.repository.js';
import { InvoiceRepository } from '../invoices/repository/invoice.repository.js';
import { ReminderRepository } from './repository/reminder.repository.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';

@Processor('invoice-reminders')
export class ReminderWorker extends WorkerHost {
  constructor(
    private readonly reminders: ReminderRepository,
    private readonly invoices: InvoiceRepository,
    private readonly customers: CustomerRepository,
    private readonly mail: ResendMailService,
    private readonly subscriptions: SubscriptionsService,
  ) {
    super();
  }

  async process(job: Job<{ id: string; businessId: string }>) {
    const { id, businessId } = job.data;
    const row = await this.reminders.findById(businessId, id);
    if (!row || row.status !== 'SCHEDULED') return;
    const invoice = await this.invoices.findById(
      businessId,
      row.invoiceId.toString(),
    );
    if (!invoice || ['PAID', 'VOID', 'CANCELLED'].includes(invoice.status)) {
      await this.reminders.transition(businessId, id, 'CANCELLED');
      return;
    }
    if (
      invoice.promisedPaymentDate &&
      invoice.promisedPaymentDate > new Date()
    ) {
      // Preserve the reminder, rescheduled to the customer's promised date.
      await job.moveToDelayed(invoice.promisedPaymentDate.getTime(), job.token);
      throw new DelayedError();
    }
    try {
      await this.subscriptions.assertFeature(businessId, 'reminders');
    } catch (error) {
      if ((error as { getStatus?: () => number }).getStatus?.() !== 403)
        throw error;
      await this.reminders.transition(businessId, id, 'CANCELLED');
      return;
    }
    const customer = await this.customers.findById(
      businessId,
      invoice.customerId.toString(),
    );
    if (!customer?.email) throw new Error('Customer email is unavailable');
    await this.mail.sendReminder(
      customer.email,
      'Pengingat ' + invoice.invoiceNumber,
      `${row.message}\n\nInvoice ${invoice.invoiceNumber}\nSisa tagihan: Rp ${Math.max(0, invoice.total - invoice.paidAmount).toLocaleString('id-ID')}\nJatuh tempo: ${invoice.dueDate.toLocaleDateString('id-ID')}\n\nAbaikan pesan ini jika Anda sudah melakukan pembayaran.`,
      'reminder-' + id,
    );
    await this.reminders.transition(businessId, id, 'SENT');
  }

  @OnWorkerEvent('failed')
  async failed(job: Job<{ id: string; businessId: string }> | undefined) {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1))
      await this.reminders.transition(
        job.data.businessId,
        job.data.id,
        'FAILED',
      );
  }
}
