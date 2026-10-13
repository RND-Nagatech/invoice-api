import {
  type PublicInvoicePageData,
  renderPublicInvoicePage,
} from './public-invoice-page.js';
import { Script } from 'node:vm';

function preview(): PublicInvoicePageData {
  return {
    invoice: {
      invoiceNumber: 'INV-202610-0002',
      issueDate: new Date('2026-10-09T00:00:00.000Z'),
      dueDate: new Date('2026-10-16T00:00:00.000Z'),
      status: 'PARTIALLY_PAID',
      items: [
        {
          name: 'Servis AC',
          description: 'Pembersihan dan pengecekan',
          quantity: 2,
          unit: 'Unit',
          unitPrice: 150_000,
          lineTotal: 300_000,
        },
        {
          name: 'Tambah freon',
          quantity: 1,
          unitPrice: 200_000,
          lineTotal: 200_000,
        },
      ],
      subtotal: 500_000,
      discount: 0,
      taxPercent: 0,
      tax: 0,
      additionalFee: 0,
      total: 500_000,
      paidAmount: 100_000,
      notes: 'Terima kasih.',
    },
    business: {
      name: 'Jasa Sejuk',
      address: 'Bandung',
      phone: '08123456789',
      email: 'usaha@example.com',
      bankAccounts: [
        {
          bankName: 'Bank BCA',
          accountNumber: '1234567890',
          accountName: 'Jasa Sejuk',
        },
      ],
    },
    customer: { name: 'Bu Rina', email: 'rina@example.com' },
  };
}

describe('public invoice page', () => {
  it('renders customer actions with a CSP nonce, private proof submission, and escaped service text', () => {
    const data = preview();
    data.invoice.serviceRecord = {
      serialNumber: '<script>evil()</script>',
      workSummary: 'Garansi roller',
      warrantyUntil: '2027-01-09',
      photoCount: 1,
    };
    const html = renderPublicInvoicePage(
      data,
      'opaque-public-token',
      'random-safe-nonce',
    );
    expect(html).toContain('<script nonce="random-safe-nonce">');
    expect(html).toContain('id="proof-form"');
    expect(html).toContain('id="promise-form"');
    expect(html).toContain('id="repeat-form"');
    expect(html).toContain('data-copy="1234567890"');
    expect(html).toContain('./service-photos/0');
    expect(html).not.toContain('<script>evil()');
    expect(html).toContain('&lt;script&gt;evil()&lt;/script&gt;');
    expect(html).not.toContain('confirm-manual');
    const source = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(source).toBeTruthy();
    expect(() => new Script(source!)).not.toThrow();
  });

  it('hides payment forms for paid invoices and all customer actions for cancelled invoices', () => {
    const data = preview();
    data.invoice.status = 'PAID';
    data.invoice.paidAmount = data.invoice.total;
    let html = renderPublicInvoicePage(data, 'opaque-public-token', 'nonce');
    expect(html).not.toContain('id="proof-form"');
    expect(html).not.toContain('id="promise-form"');
    expect(html).toContain('id="repeat-form"');
    data.invoice.status = 'CANCELLED';
    html = renderPublicInvoicePage(data, 'opaque-public-token', 'nonce');
    expect(html).not.toContain('id="repeat-form"');
  });
  it('shows the invoice, confirmed paid amount, remaining balance and PDF link', () => {
    const html = renderPublicInvoicePage(preview(), 'opaque-public-token');

    expect(html).toContain('INV-202610-0002');
    expect(html).toContain('Servis AC');
    expect(html).toContain('9 Oktober 2026');
    expect(html).toContain('16 Oktober 2026');
    expect(html).toContain('Dibayar sebagian');
    expect(html).toContain('<dt>Sudah dibayar</dt><dd>Rp 100.000</dd>');
    expect(html).toContain('<dt>Sisa tagihan</dt><dd>Rp 400.000</dd>');
    expect(html).toContain('href="../opaque-public-token/pdf"');
    expect(html).toContain('1234567890');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<form');
  });

  it('escapes every free text field and encodes the token in the PDF URL', () => {
    const data = preview();
    const payload = '<img src=x onerror="alert(1)"> & \'';
    data.invoice.invoiceNumber = payload;
    data.invoice.items[0] = {
      ...data.invoice.items[0],
      name: payload,
      description: payload,
      unit: payload,
    };
    data.invoice.notes = payload;
    data.business = {
      name: payload,
      address: payload,
      email: payload,
      phone: payload,
      defaultFooter: payload,
      bankAccounts: [
        { bankName: payload, accountNumber: payload, accountName: payload },
      ],
    };
    data.customer = {
      name: payload,
      companyName: payload,
      address: payload,
      email: payload,
      phone: payload,
    };
    const html = renderPublicInvoicePage(data, 'token"/><script>?/');

    expect(html).not.toContain(payload);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;',
    );
    expect(html).toContain('href="../token%22%2F%3E%3Cscript%3E%3F%2F/pdf"');
  });

  it('only uses public display fields and never dumps internal identifiers', () => {
    const data = {
      ...preview(),
      accessToken: 'private-business-secret',
      invoice: {
        ...preview().invoice,
        id: 'internal-invoice-id',
        businessId: 'private-tenant-id',
        customerId: 'private-customer-id',
        version: 9938,
      },
      business: { ...preview().business, apiKey: 'private-api-key' },
    };

    const html = renderPublicInvoicePage(data, 'public-token');

    for (const privateValue of [
      'internal-invoice-id',
      'private-tenant-id',
      'private-customer-id',
      'private-business-secret',
      'private-api-key',
      '9938',
    ]) {
      expect(html).not.toContain(privateValue);
    }
  });

  it('shows a zero balance for fully paid legacy invoices', () => {
    const data = preview();
    data.invoice.status = 'PAID';
    data.invoice.paidAmount = 0;

    const html = renderPublicInvoicePage(data, 'public-token');

    expect(html).toContain('status-paid">Lunas');
    expect(html).toContain('<dt>Sudah dibayar</dt><dd>Rp 500.000</dd>');
    expect(html).toContain('<dt>Sisa tagihan</dt><dd>Rp 0</dd>');
    expect(html).not.toContain('<h2>Informasi pembayaran</h2>');
  });

  it('never shows negative balances or a transfer instruction on cancelled invoices', () => {
    const data = preview();
    data.invoice.status = 'CANCELLED';
    data.invoice.paidAmount = 600_000;

    const html = renderPublicInvoicePage(data, 'public-token');

    expect(html).toContain('Dibatalkan');
    expect(html).toContain('<dt>Sisa tagihan</dt><dd>Rp 0</dd>');
    expect(html).not.toContain('<h2>Informasi pembayaran</h2>');
    expect(html).not.toContain('Rp -');
  });

  it('supports saved bank account key aliases without rendering unknown fields', () => {
    const data = preview();
    data.business.bankAccounts = [
      { bank: 'BRI', number: '987654', holder: 'Pemilik Bisnis' },
      { bankName: 'Incomplete account', apiKey: 'private-bank-key' },
    ];

    const html = renderPublicInvoicePage(data, 'public-token');

    expect(html).toContain('BRI');
    expect(html).toContain('987654');
    expect(html).toContain('Pemilik Bisnis');
    expect(html).not.toContain('Incomplete account');
    expect(html).not.toContain('private-bank-key');
  });
});
