import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import type { CustomerRepository } from '../customers/repository/customer.repository.js';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import type { InvoiceRepository } from './repository/invoice.repository.js';
import type { InvoiceDocument } from './schemas/invoice.schema.js';
import { InvoicesService } from './invoices.service.js';
import { renderPublicInvoicePage } from './public-invoice-page.js';

describe('Invoice payment follow-up preparation', () => {
  const businessId = new Types.ObjectId().toString();
  const customerId = new Types.ObjectId();
  const invoiceId = new Types.ObjectId().toString();
  const principal: AuthenticatedPrincipal = {
    id: new Types.ObjectId().toString(),
    businessId,
    sessionId: new Types.ObjectId().toString(),
  };
  let invoice: InvoiceDocument;
  let findById: ReturnType<typeof vi.fn>;
  let findCustomer: ReturnType<typeof vi.fn>;
  let assertFeature: ReturnType<typeof vi.fn>;
  let ensurePublicId: ReturnType<typeof vi.fn>;
  let transition: ReturnType<typeof vi.fn>;
  let applyPayment: ReturnType<typeof vi.fn>;
  let service: InvoicesService;

  beforeEach(() => {
    invoice = {
      id: invoiceId,
      businessId: new Types.ObjectId(businessId),
      customerId,
      customerName: 'Bu Rina',
      invoiceNumber: 'INV-209901-0002',
      publicId: 'opaque-public-token',
      issueDate: new Date('2099-01-07T00:00:00.000Z'),
      dueDate: new Date('2099-01-14T00:00:00.000Z'),
      status: 'PARTIALLY_PAID',
      paidAmount: 100_000,
      paidAt: null,
      total: 500_000,
      appliedPaymentReferences: ['confirmed-dp'],
    } as unknown as InvoiceDocument;
    findById = vi.fn().mockImplementation(async () => invoice);
    findCustomer = vi.fn().mockResolvedValue({ phone: '081234567890' });
    assertFeature = vi.fn().mockResolvedValue(undefined);
    ensurePublicId = vi.fn();
    transition = vi.fn();
    applyPayment = vi.fn();
    service = new InvoicesService(
      {
        findById,
        ensurePublicId,
        transition,
        applyPayment,
      } as unknown as InvoiceRepository,
      { findById: findCustomer } as unknown as CustomerRepository,
      { assertFeature } as unknown as SubscriptionsService,
      undefined,
      undefined,
      new ConfigService({
        PUBLIC_INVOICE_BASE_URL:
          'https://invoice.example.com/api/v1/public/invoices/',
      }),
    );
  });

  it('requires Pro reminders before querying invoice or customer information', async () => {
    assertFeature.mockRejectedValue(
      new ForbiddenException({ code: 'PRO_REQUIRED' }),
    );

    await expect(service.followUp(principal, invoiceId)).rejects.toThrow(
      ForbiddenException,
    );

    expect(assertFeature).toHaveBeenCalledWith(businessId, 'reminders');
    expect(findById).not.toHaveBeenCalled();
    expect(findCustomer).not.toHaveBeenCalled();
  });

  it('prepares an Indonesian reminder with the confirmed DP and exact remaining balance', async () => {
    const before = structuredClone({
      status: invoice.status,
      paidAmount: invoice.paidAmount,
      paidAt: invoice.paidAt,
      references: invoice.appliedPaymentReferences,
    });
    const result = await service.followUp(principal, invoiceId);

    expect(result).toMatchObject({
      invoiceNumber: 'INV-209901-0002',
      phone: '081234567890',
      balance: 400_000,
      shareUrl:
        'https://invoice.example.com/api/v1/public/invoices/opaque-public-token/view',
    });
    expect(result.message).toContain('Halo Bu Rina');
    expect(result.message).toContain('Total: Rp 500.000');
    expect(result.message).toContain('Pembayaran terkonfirmasi: Rp 100.000');
    expect(result.message).toContain('Sisa tagihan: Rp 400.000');
    expect(result.message).toContain('Jatuh tempo: 14 Januari 2099');
    expect(result.message).toContain(result.shareUrl);
    expect(result.message).not.toContain(invoiceId);
    expect(result.message).not.toContain(businessId);
    expect(findById).toHaveBeenCalledWith(businessId, invoiceId);
    expect(findCustomer).toHaveBeenCalledWith(
      businessId,
      customerId.toString(),
    );
    expect(transition).not.toHaveBeenCalled();
    expect(applyPayment).not.toHaveBeenCalled();
    expect({
      status: invoice.status,
      paidAmount: invoice.paidAmount,
      paidAt: invoice.paidAt,
      references: invoice.appliedPaymentReferences,
    }).toEqual(before);
  });

  it('prepares English wording and date format with the same financial amounts', async () => {
    const result = await service.followUp(principal, invoiceId, 'en');

    expect(result.message).toContain('Hello Bu Rina');
    expect(result.message).toContain('Confirmed payments: Rp 100.000');
    expect(result.message).toContain('Remaining balance: Rp 400.000');
    expect(result.message).toContain('Due date: 14 January 2099');
    expect(result.balance).toBe(400_000);
    expect(transition).not.toHaveBeenCalled();
    expect(applyPayment).not.toHaveBeenCalled();
  });

  it('cannot prepare a reminder for an invoice outside the authenticated tenant', async () => {
    findById.mockImplementation(async (tenant: string, id: string) =>
      tenant === businessId && id === invoiceId ? invoice : null,
    );
    const stranger = {
      ...principal,
      businessId: new Types.ObjectId().toString(),
    };

    await expect(service.followUp(stranger, invoiceId)).rejects.toThrow(
      NotFoundException,
    );

    expect(assertFeature).toHaveBeenCalledWith(
      stranger.businessId,
      'reminders',
    );
    expect(findById).toHaveBeenCalledWith(stranger.businessId, invoiceId);
    expect(findCustomer).not.toHaveBeenCalled();
    expect(ensurePublicId).not.toHaveBeenCalled();
  });

  it.each(['PAID', 'CANCELLED', 'VOID'] as const)(
    'refuses closed invoices with status %s',
    async (status) => {
      invoice.status = status;

      await expect(service.followUp(principal, invoiceId)).rejects.toThrow(
        BadRequestException,
      );

      expect(findCustomer).not.toHaveBeenCalled();
      expect(ensurePublicId).not.toHaveBeenCalled();
      expect(transition).not.toHaveBeenCalled();
    },
  );

  it('refuses a zero balance even if legacy status has not been updated', async () => {
    invoice.paidAmount = invoice.total;

    await expect(service.followUp(principal, invoiceId)).rejects.toThrow(
      BadRequestException,
    );

    expect(findCustomer).not.toHaveBeenCalled();
  });

  it('uses an empty phone when the customer is no longer available', async () => {
    findCustomer.mockResolvedValue(null);

    const result = await service.followUp(principal, invoiceId, 'en');

    expect(result.phone).toBe('');
    expect(result.message).toContain('Hello Bu Rina');
    expect(result.balance).toBe(400_000);
  });

  it('links the public view to the PDF under the same token and API path', async () => {
    const result = await service.followUp(principal, invoiceId);
    const html = renderPublicInvoicePage(
      {
        invoice: {
          invoiceNumber: invoice.invoiceNumber,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          status: invoice.status,
          items: [],
          subtotal: invoice.total,
          discount: 0,
          taxPercent: 0,
          tax: 0,
          additionalFee: 0,
          total: invoice.total,
          paidAmount: invoice.paidAmount,
        },
        business: { name: 'Jasa Sejuk' },
        customer: { name: invoice.customerName },
      },
      'opaque-public-token',
    );
    const pdfHref = /class="download" href="([^"]+)"/.exec(html)?.[1];

    expect(result.shareUrl.endsWith('/view')).toBe(true);
    expect(pdfHref).toBe('../opaque-public-token/pdf');
    expect(new URL(pdfHref ?? '', result.shareUrl).toString()).toBe(
      'https://invoice.example.com/api/v1/public/invoices/opaque-public-token/pdf',
    );
  });
});
