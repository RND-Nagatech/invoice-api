import {
  customerToolsScript,
  customerToolsStyles,
  renderCustomerTools,
} from './public-invoice-tools.js';
type OptionalText = string | null | undefined;

/** The renderer reads only customer-facing fields, never serializes API data. */
export interface PublicInvoicePageData {
  invoice: {
    invoiceNumber: string;
    customerName?: OptionalText;
    issueDate: Date | string;
    dueDate: Date | string;
    status: string;
    items: Array<{
      name: string;
      description?: OptionalText;
      quantity: number;
      unit?: OptionalText;
      unitPrice: number;
      lineTotal: number;
    }>;
    subtotal: number;
    discount: number;
    taxPercent: number;
    tax: number;
    additionalFee: number;
    total: number;
    paidAmount?: number;
    notes?: OptionalText;
    promisedPaymentDate?: Date | string | null;
    serviceRecord?: {
      serialNumber: string;
      workSummary: string;
      warrantyStartsAt?: Date | string | null;
      warrantyUntil?: Date | string | null;
      nextServiceAt?: Date | string | null;
      photoCount: number;
    } | null;
  };
  business: {
    name: string;
    address?: OptionalText;
    email?: OptionalText;
    phone?: OptionalText;
    bankAccounts?: Array<Record<string, unknown>>;
    defaultFooter?: OptionalText;
  };
  customer: {
    name: string;
    companyName?: OptionalText;
    address?: OptionalText;
    email?: OptionalText;
    phone?: OptionalText;
  };
}

function escapeHtml(value: unknown): string {
  const text =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return text.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function amount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function rupiah(value: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function dateLabel(value: Date | string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function contactLines(values: OptionalText[]): string {
  return values
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => `<p class="contact-line">${escapeHtml(value)}</p>`)
    .join('');
}

function bankText(account: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = account[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

const statusLabels: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Belum dibayar', className: 'status-unpaid' },
  SENT: { label: 'Belum dibayar', className: 'status-unpaid' },
  VIEWED: { label: 'Belum dibayar', className: 'status-unpaid' },
  PARTIALLY_PAID: { label: 'Dibayar sebagian', className: 'status-partial' },
  PAID: { label: 'Lunas', className: 'status-paid' },
  OVERDUE: { label: 'Jatuh tempo', className: 'status-overdue' },
  CANCELLED: { label: 'Dibatalkan', className: 'status-cancelled' },
  VOID: { label: 'Tidak berlaku', className: 'status-cancelled' },
};

export function renderPublicInvoicePage(
  data: PublicInvoicePageData,
  publicId: string,
  nonce = '',
): string {
  const { invoice, business, customer } = data;
  const total = amount(invoice.total);
  // Older paid invoices can predate the paidAmount field.
  const paid =
    invoice.status === 'PAID'
      ? total
      : Math.min(total, amount(invoice.paidAmount));
  const balance = Math.max(0, total - paid);
  const status = statusLabels[invoice.status] ?? statusLabels.DRAFT;
  const number = escapeHtml(invoice.invoiceNumber);
  const pdfUrl = `../${encodeURIComponent(publicId)}/pdf`;
  const isCancelled = ['CANCELLED', 'VOID'].includes(invoice.status);
  const bankAccounts = (business.bankAccounts ?? [])
    .filter((account) => account && typeof account === 'object')
    .map((account) => {
      const bank = bankText(account, ['bankName', 'bank', 'name']);
      const accountNumber = bankText(account, [
        'accountNumber',
        'number',
        'account',
      ]);
      const owner = bankText(account, ['accountName', 'holder', 'holderName']);
      if (!accountNumber) return '';
      return `<div class="bank-account">
        <span class="bank-icon" aria-hidden="true">↗</span>
        <div><p class="bank-name">${escapeHtml(bank || 'Rekening bank')}</p>
          <p class="bank-number">${escapeHtml(accountNumber)}</p>
          ${owner ? `<p class="muted">a.n. ${escapeHtml(owner)}</p>` : ''}
        </div>
        ${nonce ? `<button class="copy-bank" type="button" data-copy="${escapeHtml(accountNumber)}">Salin</button>` : ''}
      </div>`;
    })
    .filter(Boolean)
    .join('');
  const itemRows = invoice.items
    .map(
      (item, index) => `<li class="item">
        <span class="item-index" aria-hidden="true">${index + 1}</span>
        <div class="item-details">
          <h3>${escapeHtml(item.name)}</h3>
          ${item.description ? `<p class="item-description">${escapeHtml(item.description)}</p>` : ''}
          <p class="item-unit">${escapeHtml(new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(item.quantity))}${item.unit ? ` ${escapeHtml(item.unit)}` : ''} × ${rupiah(amount(item.unitPrice))}</p>
        </div>
        <p class="item-amount">${rupiah(amount(item.lineTotal))}</p>
      </li>`,
    )
    .join('');
  const adjustmentRows = [
    amount(invoice.discount) > 0
      ? `<div class="summary-row"><dt>Diskon</dt><dd>−${rupiah(amount(invoice.discount))}</dd></div>`
      : '',
    amount(invoice.tax) > 0
      ? `<div class="summary-row"><dt>Pajak${invoice.taxPercent > 0 ? ` (${escapeHtml(new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(invoice.taxPercent))}%)` : ''}</dt><dd>${rupiah(amount(invoice.tax))}</dd></div>`
      : '',
    amount(invoice.additionalFee) > 0
      ? `<div class="summary-row"><dt>Biaya tambahan</dt><dd>${rupiah(amount(invoice.additionalFee))}</dd></div>`
      : '',
  ].join('');

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light">
  <title>${number} — ${escapeHtml(business.name)}</title>
  <style>
    :root{color-scheme:light;--ink:#202131;--muted:#777988;--line:#ececf2;--accent:#6036e9;--paper:#fff;--soft:#f7f6fb}
    *{box-sizing:border-box}body{margin:0;color:var(--ink);background:#f5f5fa;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.55;-webkit-text-size-adjust:100%}a{color:inherit}p,h1,h2,h3{margin:0}main{width:min(100%,920px);margin:0 auto;padding:32px 24px 36px;padding-top:max(32px,env(safe-area-inset-top));padding-left:max(24px,env(safe-area-inset-left));padding-right:max(24px,env(safe-area-inset-right));padding-bottom:max(36px,env(safe-area-inset-bottom))}.topline{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px}.brand{font-size:17px;font-weight:800;letter-spacing:-.4px}.brand span{color:var(--accent)}.top-caption{font-size:12px;color:var(--muted)}.paper{background:var(--paper);border:1px solid var(--line);border-radius:24px;box-shadow:0 8px 36px #25203b06;overflow:hidden}.hero{padding:32px;background:linear-gradient(130deg,#fcfbff,#f3f0fc);position:relative}.hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:24px}.eyebrow{font-size:11px;letter-spacing:1.8px;font-weight:800;color:var(--muted);margin-bottom:7px}h1{font-size:25px;line-height:1.2;letter-spacing:-.6px;overflow-wrap:anywhere}.status{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;font-size:12px;font-weight:700;border-radius:99px;padding:7px 12px;background:#fff;color:#747582;border:1px solid #e8e5ef}.status:before{content:"";height:6px;width:6px;border-radius:50%;background:currentColor}.status-paid{color:#178153;background:#effaf4;border-color:#d7f0e2}.status-partial{color:#876400;background:#fffae9;border-color:#f4e9bc}.status-overdue{color:#bf424b;background:#fff1f2;border-color:#f6d9dd}.hero-total{font-size:36px;font-weight:800;line-height:1.2;letter-spacing:-1px;margin-top:4px}.hero-label{color:var(--muted);font-size:13px}.dates{display:flex;gap:48px;margin-top:28px}.date-value{font-weight:650;font-size:14px;margin-top:4px}.body{padding:32px}.parties{display:grid;grid-template-columns:1fr 1fr;gap:32px;padding-bottom:28px;border-bottom:1px solid var(--line)}h2{font-size:16px;letter-spacing:-.2px;margin-bottom:14px}.person-name{font-size:16px;font-weight:750;margin-bottom:5px;overflow-wrap:anywhere}.contact-line{font-size:13px;white-space:pre-line;color:var(--muted);overflow-wrap:anywhere}.section{margin-top:28px}.section-top{display:flex;justify-content:space-between;gap:12px;align-items:center}.count{font-size:12px;color:var(--muted)}.items{list-style:none;margin:0;padding:0}.item{display:flex;align-items:flex-start;gap:12px;padding:18px 0;border-bottom:1px solid var(--line)}.item-index{width:26px;height:26px;display:flex;justify-content:center;align-items:center;background:var(--soft);border-radius:8px;font-size:12px;color:var(--muted);flex-shrink:0}.item-details{flex:1;min-width:0}.item h3{font-size:14px;line-height:1.4;font-weight:700;overflow-wrap:anywhere}.item-description{font-size:12px;color:var(--muted);white-space:pre-line;margin-top:4px;overflow-wrap:anywhere}.item-unit{font-size:12px;color:var(--muted);margin-top:8px}.item-amount{font-size:14px;font-weight:700;white-space:nowrap}.summary{margin:22px 0 0 auto;max-width:390px}.summary-row{display:flex;justify-content:space-between;gap:16px;margin:10px 0;font-size:13px}.summary dt{color:var(--muted)}.summary dd{margin:0;text-align:right;font-weight:650;white-space:nowrap}.summary-total{padding-top:13px;border-top:1px solid var(--line);font-size:15px}.summary-total dt{color:var(--ink);font-weight:750}.balance{margin-top:14px;padding:14px 16px;border-radius:12px;background:var(--soft);font-size:17px}.balance dt{color:var(--ink);font-weight:750}.balance dd{color:var(--accent);font-weight:800}.notes{padding:18px 20px;background:#fafafd;border:1px solid var(--line);border-radius:14px;font-size:13px;color:#656777;white-space:pre-line;overflow-wrap:anywhere}.notes h2{color:var(--ink);font-size:14px;margin-bottom:7px}.bank-list{display:grid;grid-template-columns:1fr 1fr;gap:12px}.bank-account{display:flex;align-items:flex-start;gap:12px;padding:16px;border:1px solid var(--line);border-radius:14px}.bank-icon{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--soft);color:var(--accent);font-size:20px;flex-shrink:0}.bank-name{font-size:13px;font-weight:700}.bank-number{font-size:15px;font-weight:750;overflow-wrap:anywhere;letter-spacing:.4px}.muted{font-size:12px;color:var(--muted)}.payment-note{font-size:12px;color:var(--muted);margin-top:12px}.actions{display:flex;justify-content:space-between;gap:24px;align-items:center;border-top:1px solid var(--line);padding:24px 32px;background:#fcfcfe}.download{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:13px 24px;background:var(--accent);border-radius:12px;color:#fff;font-weight:700;text-decoration:none;font-size:14px;white-space:nowrap}.download:focus-visible{outline:3px solid #ac94ff;outline-offset:3px}.footer{font-size:12px;color:var(--muted);max-width:450px;white-space:pre-line;overflow-wrap:anywhere}.powered{text-align:center;margin-top:22px;font-size:11px;color:#9293a0}
    @media(max-width:600px){main{padding:20px 14px 28px;padding-top:max(20px,env(safe-area-inset-top));padding-left:max(14px,env(safe-area-inset-left));padding-right:max(14px,env(safe-area-inset-right));padding-bottom:max(28px,env(safe-area-inset-bottom))}.topline{margin-bottom:16px}.paper{border-radius:20px}.hero,.body{padding:22px 20px}.hero-top{gap:12px;flex-wrap:wrap;margin-bottom:22px}h1{font-size:22px}.hero-total{font-size:31px}.dates{gap:24px;justify-content:space-between}.date-value{font-size:12px}.parties{grid-template-columns:1fr;gap:24px}.parties h2{margin-bottom:10px}.item{display:grid;grid-template-columns:24px minmax(0,1fr);column-gap:10px;row-gap:8px}.item-amount{grid-column:2;align-self:start}.item-index{width:24px;height:24px}.summary{max-width:none}.bank-list{grid-template-columns:1fr}.actions{padding:20px;flex-direction:column-reverse;gap:14px;align-items:stretch}.download{width:100%;min-height:48px}.footer{text-align:center}.top-caption{font-size:11px}}
    @media print{body{background:white}main{padding:0;width:100%}.paper{box-shadow:none;border:0}.topline,.actions,.powered{display:none}.hero{background:#f7f6fb}.body{padding-top:24px}}
    ${customerToolsStyles}
  </style>
</head>
<body>
  <main>
    <div class="topline"><p class="brand">Invoice<span>Kilat</span></p><p class="top-caption">Tagihan dari ${escapeHtml(business.name)}</p></div>
    <article class="paper" aria-label="Invoice ${number}">
      <header class="hero">
        <div class="hero-top"><div><p class="eyebrow">INVOICE</p><h1>${number}</h1></div><span class="status ${status.className}">${status.label}</span></div>
        <p class="hero-label">Total tagihan</p><p class="hero-total">${rupiah(total)}</p>
        <div class="dates"><div><p class="hero-label">Tanggal invoice</p><p class="date-value">${dateLabel(invoice.issueDate)}</p></div><div><p class="hero-label">Jatuh tempo</p><p class="date-value">${dateLabel(invoice.dueDate)}</p></div></div>
      </header>
      <div class="body">
        <div class="parties">
          <section><h2>Diterbitkan oleh</h2><p class="person-name">${escapeHtml(business.name)}</p>${contactLines([business.address, business.email, business.phone])}</section>
          <section><h2>Ditagihkan kepada</h2><p class="person-name">${escapeHtml(customer.companyName || customer.name || invoice.customerName)}</p>${contactLines([customer.companyName && customer.companyName !== customer.name ? customer.name : '', customer.address, customer.email, customer.phone])}</section>
        </div>
        <section class="section"><div class="section-top"><h2>Rincian tagihan</h2><span class="count">${invoice.items.length} item</span></div><ol class="items">${itemRows}</ol></section>
        <dl class="summary">
          <div class="summary-row"><dt>Subtotal</dt><dd>${rupiah(amount(invoice.subtotal))}</dd></div>
          ${adjustmentRows}
          <div class="summary-row summary-total"><dt>Total</dt><dd>${rupiah(total)}</dd></div>
          <div class="summary-row"><dt>Sudah dibayar</dt><dd>${rupiah(paid)}</dd></div>
          <div class="summary-row balance"><dt>Sisa tagihan</dt><dd>${rupiah(balance)}</dd></div>
        </dl>
        ${invoice.notes ? `<section class="section notes"><h2>Catatan</h2>${escapeHtml(invoice.notes)}</section>` : ''}
        ${bankAccounts && !isCancelled && balance > 0 ? `<section class="section"><h2>Informasi pembayaran</h2><div class="bank-list">${bankAccounts}</div><p class="payment-note">Cantumkan nomor invoice ${number} saat pembayaran. Hubungi ${escapeHtml(business.name)} untuk konfirmasi pembayaran.</p></section>` : ''}
      </div>
      <footer class="actions"><p class="footer">${escapeHtml(business.defaultFooter || 'Simpan salinan invoice ini untuk catatan Anda.')}</p><a class="download" href="${pdfUrl}" download="${number}.pdf"><span aria-hidden="true">↓</span> Unduh PDF</a></footer>
    </article>
    ${renderCustomerTools(data, publicId, !!nonce)}
    <p class="powered">Dibuat dengan InvoiceKilat</p>
  </main>
${customerToolsScript(nonce)}
</body>
</html>`;
}
