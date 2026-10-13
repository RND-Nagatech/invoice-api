import 'reflect-metadata';
import type { Response } from 'express';
import type { InvoicesService } from './invoices.service.js';
import type { InvoicePdfService } from './invoice-pdf.service.js';
import { PublicInvoicesController } from './public-invoices.controller.js';

describe('PublicInvoicesController', () => {
  it('renders public HTML without authentication or payment writes and protects token privacy', async () => {
    const publicPreview = vi.fn().mockResolvedValue({
      invoice: {
        invoiceNumber: 'INV-202610-0002',
        issueDate: '2026-10-09',
        dueDate: '2026-10-16',
        status: 'SENT',
        items: [],
        subtotal: 500_000,
        discount: 0,
        taxPercent: 0,
        tax: 0,
        additionalFee: 0,
        total: 500_000,
      },
      business: { name: 'Jasa Sejuk' },
      customer: { name: 'Bu Rina' },
    });
    const markPaid = vi.fn();
    const invoices = { publicPreview, markPaid } as unknown as InvoicesService;
    const render = vi.fn();
    const controller = new PublicInvoicesController(invoices, {
      render,
    } as unknown as InvoicePdfService);
    const set = vi.fn();
    const send = vi.fn();
    const response = { set, send } as unknown as Response;

    await controller.view('opaque-public-token', response);

    expect(publicPreview).toHaveBeenCalledWith('opaque-public-token');
    expect(markPaid).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy':
          expect.stringContaining("default-src 'none'"),
      }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.stringContaining('<!doctype html>'),
    );
  });

  it('preserves the existing public PDF endpoint and adds private cache headers', async () => {
    const publicInvoiceIdentity = vi.fn().mockResolvedValue({
      businessId: 'private-business',
      id: 'private-invoice',
      invoiceNumber: 'INV-202610-0002',
    });
    const data = Buffer.from('%PDF-test');
    const render = vi.fn().mockResolvedValue(data);
    const controller = new PublicInvoicesController(
      { publicInvoiceIdentity } as unknown as InvoicesService,
      { render } as unknown as InvoicePdfService,
    );
    const set = vi.fn();
    const end = vi.fn();

    await controller.pdfFile('opaque-public-token', {
      set,
      end,
    } as unknown as Response);

    expect(render).toHaveBeenCalledWith('private-business', 'private-invoice');
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="INV-202610-0002.pdf"',
        'Cache-Control': 'private, no-store, max-age=0',
      }),
    );
    expect(end).toHaveBeenCalledWith(data);
  });
});
