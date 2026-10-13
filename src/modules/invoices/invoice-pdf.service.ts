import { decodeLogo } from '../../common/utils/image.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Types } from 'mongoose';
import { BusinessRepository } from '../businesses/repository/business.repository.js';
import { CustomerRepository } from '../customers/repository/customer.repository.js';
import { InvoiceRepository } from './repository/invoice.repository.js';
import type { InvoiceDocument } from './schemas/invoice.schema.js';

const money = (value: number) =>
  `Rp ${new Intl.NumberFormat('id-ID').format(value)}`;
const date = (value: Date) =>
  new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(value);

const templateAccents: Record<string, string> = {
  'modern-purple': '#5B31F4',
  'clean-minimal': '#27364B',
  'corporate-blue': '#1769AA',
  'elegant-dark': '#1E1E2E',
  'lavender-studio': '#7C5CFC',
  'sunset-orange': '#E86A33',
  'forest-green': '#2D7A56',
  'ocean-teal': '#0B8291',
  'mono-black': '#222222',
  'paper-slate': '#52616B',
  'soft-pink': '#C25B7C',
  'royal-navy': '#243B6B',
  skyline: '#3A78B8',
  'warm-sand': '#A77B5D',
  'mint-fresh': '#4FAF91',
  'berry-bold': '#9E315D',
  'construction-yellow': '#D89516',
  'legal-charcoal': '#36454F',
  'indigo-consult': '#4A4CC7',
  'coral-market': '#E85D5D',
};

@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly businesses: BusinessRepository,
    private readonly customers: CustomerRepository,
  ) {}

  async render(businessId: string, id: string): Promise<Buffer> {
    const invoice = await this.invoices.findById(businessId, id);
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan.');
    const [business, customer] = await Promise.all([
      this.businesses.findById(new Types.ObjectId(businessId)),
      this.customers.findById(businessId, invoice.customerId.toString()),
    ]);
    if (!business)
      throw new NotFoundException('Profil bisnis tidak ditemukan.');
    return this.build(invoice, business, customer);
  }

  private build(
    invoice: InvoiceDocument,
    business: {
      name: string;
      logo: string;
      address: string;
      phone: string;
      email: string;
      website: string;
      brandColor?: string;
      defaultFooter?: string;
      qris?: string;
      bankAccounts?: Array<Record<string, string>>;
    },
    customer: {
      name: string;
      companyName: string;
      email: string;
      phone: string;
      address: string;
    } | null,
  ): Promise<Buffer> {
    const document = new PDFDocument({
      size: 'A4',
      margin: 48,
      bufferPages: true,
      info: {
        Title: `Invoice ${invoice.invoiceNumber}`,
        Author: business.name,
      },
    });
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);

      const accent =
        business.brandColor?.trim() ||
        templateAccents[invoice.templateId] ||
        '#5B31F4';
      const left = document.page.margins.left;
      const right = document.page.width - document.page.margins.right;

      let businessX = left;
      if (business.logo?.startsWith('data:image/')) {
        try {
          document.image(decodeLogo(business.logo).buffer, left, 48, {
            fit: [44, 44],
          });
          businessX += 54;
        } catch {
          /* Preserve access to PDFs even if an old logo is invalid. */
        }
      }
      document
        .fillColor(accent)
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(business.name, businessX, 48, { width: right - businessX - 195 });
      document
        .fillColor('#5B6472')
        .fontSize(9)
        .font('Helvetica')
        .text(
          [business.address, business.phone, business.email, business.website]
            .filter((value) => value.trim().length > 0)
            .join(' | '),
          businessX,
          80,
          { width: right - businessX - 195 },
        );
      document
        .fillColor(accent)
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('INVOICE', right - 180, 52, { width: 180, align: 'right' });
      document
        .fillColor('#27303F')
        .fontSize(10)
        .font('Helvetica')
        .text(invoice.invoiceNumber, right - 180, 80, {
          width: 180,
          align: 'right',
        })
        .text(`Tanggal: ${date(invoice.issueDate)}`, right - 180, 96, {
          width: 180,
          align: 'right',
        })
        .text(`Jatuh tempo: ${date(invoice.dueDate)}`, right - 180, 112, {
          width: 180,
          align: 'right',
        });
      document
        .moveTo(left, 145)
        .lineTo(right, 145)
        .strokeColor('#E5E7EB')
        .stroke();

      document
        .fillColor('#6B7280')
        .fontSize(9)
        .font('Helvetica')
        .text('TAGIHAN KEPADA', left, 165);
      document
        .fillColor('#111827')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(
          customer?.companyName || customer?.name || invoice.customerName,
          left,
          181,
        );
      document
        .fillColor('#4B5563')
        .fontSize(9)
        .font('Helvetica')
        .text(
          [customer?.name, customer?.address, customer?.email, customer?.phone]
            .filter((value): value is string => Boolean(value?.trim()))
            .join('\n'),
          left,
          199,
        );

      const tableHeader = (top: number) => {
        document.roundedRect(left, top, right - left, 26, 5).fill(accent);
        document
          .fillColor('#FFFFFF')
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('ITEM', left + 10, top + 8)
          .text('QTY', 330, top + 8)
          .text('HARGA', 380, top + 8)
          .text('JUMLAH', right - 70, top + 8, { width: 60, align: 'right' });
      };
      let y = 260;
      tableHeader(y);
      y += 38;
      for (const item of invoice.items) {
        document.font('Helvetica-Bold').fontSize(10);
        const titleHeight = document.heightOfString(item.name, { width: 250 });
        document.font('Helvetica').fontSize(8);
        const descriptionHeight = item.description
          ? document.heightOfString(item.description, { width: 250 })
          : 0;
        const rowHeight = Math.max(28, titleHeight + descriptionHeight + 16);
        if (y + rowHeight > document.page.height - 100) {
          document.addPage();
          y = 48;
          document
            .fillColor(accent)
            .font('Helvetica-Bold')
            .fontSize(12)
            .text(invoice.invoiceNumber, left, y);
          y += 28;
          tableHeader(y);
          y += 38;
        }
        document
          .fillColor('#111827')
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(item.name, left + 10, y, { width: 250 });
        if (item.description)
          document
            .fillColor('#6B7280')
            .fontSize(8)
            .font('Helvetica')
            .text(item.description, left + 10, y + titleHeight + 3, {
              width: 250,
            });
        document
          .fillColor('#374151')
          .fontSize(9)
          .font('Helvetica')
          .text(`${item.quantity} ${item.unit}`, 330, y, { width: 45 })
          .text(money(item.unitPrice), 380, y, { width: 85 })
          .text(money(item.lineTotal), right - 90, y, {
            width: 80,
            align: 'right',
          });
        y += rowHeight;
        document
          .moveTo(left, y - 8)
          .lineTo(right, y - 8)
          .strokeColor('#F0F1F4')
          .stroke();
      }
      // Keep totals and payment instructions together below the final item.
      document.font('Helvetica').fontSize(9);
      const notesHeight = invoice.notes
        ? document.heightOfString(invoice.notes, { width: 270 })
        : 0;
      if (y + 200 + notesHeight > document.page.height - 70) {
        document.addPage();
        y = 48;
      }
      y += 14;
      const totalX = right - 210;
      const amount = (label: string, value: number, bold = false) => {
        document
          .fillColor(bold ? '#111827' : '#6B7280')
          .fontSize(bold ? 12 : 10)
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(label, totalX, y)
          .text(money(value), right - 90, y, { width: 90, align: 'right' });
        y += bold ? 24 : 18;
      };
      amount('Subtotal', invoice.subtotal);
      if (invoice.discount > 0) amount('Diskon', -invoice.discount);
      if (invoice.tax > 0)
        amount(`Pajak (${invoice.taxPercent}%)`, invoice.tax);
      if (invoice.additionalFee > 0)
        amount('Biaya tambahan', invoice.additionalFee);
      document
        .moveTo(totalX, y - 7)
        .lineTo(right, y - 7)
        .strokeColor(accent)
        .stroke();
      amount('TOTAL', invoice.total, true);
      if (invoice.notes) {
        document
          .fillColor('#6B7280')
          .fontSize(9)
          .font('Helvetica')
          .text('CATATAN', left, y + 16);
        document
          .fillColor('#374151')
          .fontSize(9)
          .text(invoice.notes, left, y + 31, { width: 270 });
      }
      const paymentLines = (business.bankAccounts ?? [])
        .map((account) =>
          `${account.bankName ?? ''} ${account.accountNumber ?? ''} a.n. ${account.accountName ?? ''}`.trim(),
        )
        .filter((line) => line.length > 0);
      if (paymentLines.length > 0 || business.qris?.trim()) {
        document
          .fillColor('#6B7280')
          .fontSize(9)
          .font('Helvetica')
          .text('PEMBAYARAN', left, y + 74);
        document
          .fillColor('#374151')
          .fontSize(9)
          .text(
            [
              ...paymentLines,
              ...(business.qris?.trim()
                ? ['QRIS tersedia pada profil bisnis']
                : []),
            ].join('\n'),
            left,
            y + 89,
            { width: 270 },
          );
      }
      const pages = document.bufferedPageRange();
      for (
        let page = pages.start;
        page < pages.start + pages.count;
        page += 1
      ) {
        document.switchToPage(page);
        // Footer text lives below the normal body margin; prevent PDFKit from
        // automatically starting another page while placing it.
        const bottomMargin = document.page.margins.bottom;
        document.page.margins.bottom = 0;
        document
          .fillColor('#6B7280')
          .fontSize(8)
          .font('Helvetica')
          .text(
            business.defaultFooter?.trim() || 'Dibuat dengan InvoiceKilat',
            left,
            document.page.height - 56,
            { width: right - left, height: 12, ellipsis: true },
          );
        if (invoice.showPageNumber ?? true)
          document
            .fillColor('#9CA3AF')
            .fontSize(8)
            .font('Helvetica')
            .text(
              `Halaman ${page - pages.start + 1} dari ${pages.count}`,
              left,
              document.page.height - 32,
              { width: right - left, align: 'right' },
            );
        document.page.margins.bottom = bottomMargin;
      }
      document.end();
    });
  }
}
