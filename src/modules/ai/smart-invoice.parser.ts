import {
  AMOUNT_PATTERN,
  NUMBER_PATTERN,
  parseIndonesianNumber,
} from './indonesian-number.js';
import { businessToday, parseInvoiceDate } from './invoice-date.js';
import type {
  ParsedInvoiceIntent,
  SmartInvoiceDraft,
  SmartInvoiceItem,
} from './smart-invoice.types.js';

const UNITS =
  'units?|pcs|buah|paket|packages?|pieces?|orang|jam|hours?|hari|days?|bulan|months?|tahun|years?|kg|kilogram|meter|liter|box|set|lusin|porsi|botol|lembar|ekor|layanan|kali';
const clean = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s:=-]+|[\s:=-]+$/g, '');
const settingValue = (clause: string) => {
  const value = new RegExp(`\\b${AMOUNT_PATTERN}\\b`, 'i').exec(clause);
  if (!value) return null;
  const parsed = parseIndonesianNumber(value[0]);
  return parsed !== null && /-\s*$/.test(clause.slice(0, value.index))
    ? -parsed
    : parsed;
};

function quantity(clause: string): {
  value: number | null;
  match: string;
  unit?: string;
} {
  const withUnit = new RegExp(
    `\\b(${NUMBER_PATTERN})\\s+(${UNITS})\\b`,
    'i',
  ).exec(clause);
  if (withUnit)
    return {
      value: /-\s*$/.test(clause.slice(0, withUnit.index))
        ? -(parseIndonesianNumber(withUnit[1]) ?? 0)
        : parseIndonesianNumber(withUnit[1]),
      match: withUnit[0],
      unit: withUnit[2],
    };
  const named = new RegExp(
    `\\b(?:sebanyak|jumlah(?:nya)?|qty|quantity)\\s*[:=]?\\s*(${NUMBER_PATTERN})\\b`,
    'i',
  ).exec(clause);
  if (named) return { value: parseIndonesianNumber(named[1]), match: named[0] };
  return { value: null, match: '' };
}

function parseItem(
  clause: string,
  warnings: string[],
): {
  item: SmartInvoiceItem;
  priceMissing: boolean;
  unitMissing: boolean;
} | null {
  let text = clean(
    clause.replace(
      /^(?:tambah(?:kan)?|add|plus|item|barang|produk|product)\s+/i,
      '',
    ),
  );
  if (!text) return null;
  if (/\b(?:rp|harga|price|ribu|rb|juta|jt|thousand|million)\b/i.test(text)) {
    text = text.replace(new RegExp(`\\s+per\\s+(?:${UNITS})\\s*$`, 'i'), '');
  }
  const qty = quantity(text);
  const resultQuantity =
    qty.value !== null &&
    Number.isInteger(qty.value) &&
    qty.value > 0 &&
    qty.value <= 10000
      ? qty.value
      : 1;
  if (qty.match) text = text.replace(qty.match, ' ');
  let price: number | null = null;
  const explicit = new RegExp(
    `(?:masing[- ]masing|harga(?:\\s+satuan)?|each|price|@)\\s*[:=]?\\s*(${AMOUNT_PATTERN})`,
    'i',
  ).exec(text);
  const currency = new RegExp(
    `\\brp\\.?\\s*(${NUMBER_PATTERN})(?:\\s*(?:ribu|rb|k|juta|jt|miliar|thousand|million))?`,
    'i',
  ).exec(text);
  const trailing = new RegExp(
    `(?:^|\\s)(${AMOUNT_PATTERN})\\s*(?:rupiah)?$`,
    'i',
  ).exec(text);
  const candidate = explicit ?? currency ?? trailing;
  if (candidate) {
    const captured =
      explicit || (!currency && trailing) ? candidate[1] : candidate[0];
    const parsed = parseIndonesianNumber(captured.replace(/\s*rupiah$/, ''));
    const unmistakable =
      !!explicit ||
      !!currency ||
      /\b(?:ribu|rb|juta|jt|miliar|rupiah|thousand|million)\b/i.test(
        captured,
      ) ||
      (parsed !== null && parsed >= 1000);
    if (unmistakable && parsed !== null) {
      if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 1_000_000_000)
        price = parsed;
      else
        warnings.push(
          `Harga pada "${clause}" berada di luar batas atau memiliki pecahan rupiah. Isi ulang harga satuannya.`,
        );
      text = text.replace(candidate[0], ' ');
    }
  }
  // "2 x Rp150.000" is an explicit quantity even without a unit.
  const multiply = new RegExp(`^(${NUMBER_PATTERN})\\s*[x×]\\s+`, 'i').exec(
    text,
  );
  let itemQuantity = resultQuantity;
  if (multiply && !qty.match) {
    const parsed = parseIndonesianNumber(multiply[1]);
    if (
      parsed !== null &&
      Number.isInteger(parsed) &&
      parsed > 0 &&
      parsed <= 10000
    )
      itemQuantity = parsed;
    else
      warnings.push(
        `Jumlah pada "${clause}" belum valid. Periksa jumlah item.`,
      );
    text = text.replace(multiply[0], '');
  }
  let description = '';
  const descriptionMatch =
    /\b(?:deskripsi|keterangan|description)\s*[:=]?\s*(.+)$/i.exec(text);
  if (descriptionMatch) {
    description = clean(descriptionMatch[1]).slice(0, 500);
    text = text.replace(descriptionMatch[0], '');
  }
  text = clean(
    text.replace(
      /\b(?:dengan harga|seharga|dengan|per unit|satuan|masing[- ]masing|harga)\s*$/i,
      '',
    ),
  );
  if (!text || /^(?:bikin|buat|invoice|tagihan)$/i.test(text)) {
    warnings.push(`Bagian "${clause}" belum memiliki nama item yang jelas.`);
    return null;
  }
  if (text.length > 120)
    warnings.push(
      `Nama item "${text.slice(0, 40)}…" dipotong menjadi 120 karakter. Periksa kembali.`,
    );
  const name = text.slice(0, 120);
  if (!qty.match && !multiply)
    warnings.push(
      `Jumlah "${name}" belum disebutkan; sementara diisi 1 ${qty.unit ?? 'unit'}.`,
    );
  if (qty.value !== null && resultQuantity !== qty.value)
    warnings.push(
      `Jumlah "${name}" harus bilangan bulat antara 1 dan 10.000; sementara diisi 1.`,
    );
  if (/\d/.test(name))
    warnings.push(
      `Angka dalam nama "${name}" belum dapat dipastikan sebagai jumlah atau harga. Periksa rincian item.`,
    );
  return {
    item: {
      name,
      description,
      quantity: itemQuantity,
      unit: qty.unit ?? 'unit',
      unitPrice: price ?? 0,
    },
    priceMissing: price === null,
    unitMissing: !qty.unit,
  };
}

function extractCustomer(
  clause: string,
): { customer: string; remainder: string } | null {
  const prefix =
    /^(?:(?:tolong|bro|please)\s+)*(?:(?:bikin|buat(?:kan)?|create|make)\s+)?(?:invoice|tagihan)\s+(?:(?:untuk|for)\s+)?/i.exec(
      clause,
    ) ?? /^(?:untuk|for|pelanggan|customer)(?:\s*[:=]\s*|\s+)/i.exec(clause);
  if (
    !prefix &&
    /^(?:pak|bapak|bu|ibu)\s+[\p{L}\s.'-]+$/iu.test(clause) &&
    !quantity(clause).match
  ) {
    return { customer: clean(clause).slice(0, 120), remainder: '' };
  }
  if (!prefix) return null;
  const rest = clause.slice(prefix[0].length);
  if (
    /^(?:item|jasa|servis|service|barang|produk|tanggal|jatuh tempo)\b/i.test(
      rest,
    )
  )
    return null;
  const stop =
    /\s+(?:seperti|kayak|sama seperti|like|same as|item|jasa|service|servis|barang|produk|sebanyak|jumlah(?:nya)?|quantity|harga|price|rp|tanggal|jatuh tempo|due)\b/i.exec(
      rest,
    );
  const name = clean(stop ? rest.slice(0, stop.index) : rest);
  return name
    ? {
        customer: name.slice(0, 120),
        remainder: stop ? clean(rest.slice(stop.index)) : '',
      }
    : null;
}

export function syncLegacyDraft(draft: SmartInvoiceDraft): void {
  draft.itemName = draft.items[0]?.name ?? '';
  draft.quantity = draft.items[0]?.quantity ?? 1;
  draft.unitPrice = draft.items[0]?.unitPrice ?? 0;
}

/** Deterministic extraction only. Defaults and unresolved instructions remain visible for review. */
export function parseSmartInvoice(
  text: string,
  now = new Date(),
): ParsedInvoiceIntent {
  const warnings: string[] = [];
  const today = businessToday(now);
  const draft: SmartInvoiceDraft = {
    customerName: '',
    items: [],
    discount: 0,
    taxPercent: 0,
    additionalFee: 0,
    depositAmount: 0,
    issueDate: today.toISOString(),
    dueDate: new Date(today.getTime() + 7 * 86_400_000).toISOString(),
    notes: '',
    itemName: '',
    quantity: 1,
    unitPrice: 0,
  };
  const intent: ParsedInvoiceIntent = {
    draft,
    reviewWarnings: warnings,
    repeatPrevious: false,
    missingPriceIndexes: [],
    missingUnitIndexes: [],
  };
  let dueProvided = false;
  // Device speech recognition may omit punctuation. Split only explicit
  // settings/payment/date markers so they cannot become part of an item name.
  const inlineSettings = new RegExp(
    `\\s+(?=(?:dp|uang muka|deposit|down payment|diskon|discount|pajak(?:\\s+ppn)?|ppn|tax|biaya tambahan|additional fee|ongkir|fee)\\s+(?:rp\\.?\\s*)?(?:-?${NUMBER_PATTERN}))`,
    'gi',
  );
  const clauses = text
    .replace(/\b(rp|pt|cv)\./gi, '$1')
    .replace(/\bdp(?=\d)/gi, 'DP ')
    .replace(
      /\s+(?=(?:sudah|telah|paid)\s+(?:dp|uang muka|deposit|down payment)\b)/gi,
      ', ',
    )
    .replace(
      inlineSettings,
      (space: string, offset: number, original: string) =>
        /\b(?:sudah|telah|paid)$/i.test(original.slice(0, offset))
          ? space
          : ', ',
    )
    .replace(
      /\s+(?=(?:jatuh tempo|pelunasan|bayar paling lambat|due|tanggal invoice|issue date|catatan|notes)\s+)/gi,
      ', ',
    )
    .replace(/\r?\n/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/[,;](?!\d)|\.(?!\d)(?=\s|$)/)
    .flatMap((clause) =>
      clause.split(/\s+(?:dan tambah(?:kan)?|tambah(?:kan)?|add|plus)\s+/i),
    )
    .map(clean)
    .filter(Boolean);
  for (let clause of clauses) {
    const customer = extractCustomer(clause);
    if (customer) {
      if (
        draft.customerName &&
        draft.customerName.toLowerCase() !== customer.customer.toLowerCase()
      )
        warnings.push(
          'Lebih dari satu pelanggan disebutkan. Pilih satu pelanggan untuk invoice ini.',
        );
      else draft.customerName = customer.customer;
      clause = customer.remainder;
      if (!clause) continue;
    }
    if (
      /\b(?:(?:seperti|kayak|sama seperti)\s+(?:kemarin|terakhir|sebelumnya)|(?:like|same as)\s+(?:yesterday|before|last time))\b/i.test(
        clause,
      )
    ) {
      intent.repeatPrevious = true;
      const qty = quantity(clause);
      if (
        qty.value !== null &&
        Number.isInteger(qty.value) &&
        qty.value > 0 &&
        qty.value <= 10000
      )
        intent.repeatQuantity = qty.value;
      else if (qty.match)
        warnings.push(
          'Jumlah untuk invoice ulang belum valid. Periksa jumlah item.',
        );
      continue;
    }
    if (
      /^(?:jumlah(?:nya)?|qty|quantity)\b/i.test(clause) &&
      /\b(?:(?:seperti|kayak|sama seperti)\s+(?:kemarin|terakhir|sebelumnya)|(?:like|same as)\s+(?:yesterday|before|last time))\b/i.test(
        text,
      )
    ) {
      const qty = quantity(clause);
      if (
        qty.value !== null &&
        Number.isInteger(qty.value) &&
        qty.value > 0 &&
        qty.value <= 10000
      )
        intent.repeatQuantity = qty.value;
      else
        warnings.push(
          'Jumlah untuk invoice ulang belum valid. Periksa jumlah item.',
        );
      continue;
    }
    if (
      /^(?:jatuh tempo|tempo|pelunasan|lunas|bayar paling lambat|due)\b/i.test(
        clause,
      )
    ) {
      dueProvided = true;
      const due = parseInvoiceDate(clause, today);
      if (due) {
        draft.dueDate = due.toISOString();
        if (due < today)
          warnings.push(
            'Tanggal jatuh tempo berada di masa lalu. Periksa tanggal sebelum menyimpan.',
          );
        if (
          /\b(?:senin|selasa|rabu|kamis|jumat|sabtu|minggu|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
            clause,
          )
        )
          warnings.push(
            `Jatuh tempo "${clause}" ditafsirkan sebagai ${due.toISOString().slice(0, 10)}. Pastikan tanggalnya sesuai.`,
          );
      } else
        warnings.push(
          `Tanggal pada "${clause}" belum dapat dibaca; sementara memakai 7 hari dari hari ini.`,
        );
      continue;
    }
    if (
      /^(?:tanggal invoice|tanggal tagihan|dibuat tanggal|issue date)\b/i.test(
        clause,
      )
    ) {
      const date = parseInvoiceDate(clause, today);
      if (date) draft.issueDate = date.toISOString();
      else
        warnings.push(
          `Tanggal invoice pada "${clause}" belum dapat dibaca; sementara memakai hari ini.`,
        );
      continue;
    }
    if (
      /^(?:(?:sudah|telah|bayar|dibayar|paid)\s+)?(?:dp|uang muka|down payment|deposit)\b/i.test(
        clause,
      )
    ) {
      const value = settingValue(clause);
      if (/\bsetengah\b/i.test(clause)) intent.depositPercent = 50;
      else if (
        value !== null &&
        value >= 0 &&
        /%|persen|percent/i.test(clause) &&
        value <= 100
      )
        intent.depositPercent = value;
      else if (
        value !== null &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 1_000_000_000
      )
        draft.depositAmount = value;
      else
        warnings.push(
          `Nominal DP pada "${clause}" belum jelas. Isi nominal DP sebelum mencatat pembayaran.`,
        );
      warnings.push(
        /\b(?:sudah|telah|dibayar|paid)\b/i.test(clause)
          ? 'DP yang disebut sudah dibayar tetap perlu dikonfirmasi penerimaannya. Draft ini tidak otomatis melunaskan invoice.'
          : 'DP ini masih rencana pembayaran. Pastikan uang telah diterima sebelum mengonfirmasi pembayaran.',
      );
      continue;
    }
    if (
      /^(?:diskon|discount|pajak|ppn|tax|biaya tambahan|additional fee|ongkir|fee)\b/i.test(
        clause,
      )
    ) {
      const value = settingValue(clause);
      if (value === null || value < 0 || value > 1_000_000_000)
        warnings.push(
          `Nilai pada "${clause}" belum dapat dibaca. Periksa pengaturan tambahan.`,
        );
      else if (/^(?:pajak|ppn|tax)/i.test(clause)) {
        if (value <= 100) draft.taxPercent = value;
        else
          warnings.push(
            'Pajak harus persentase antara 0 dan 100. Isi ulang persentase pajak.',
          );
      } else if (/^(?:diskon|discount)/i.test(clause)) {
        if (/%|persen|percent/i.test(clause)) {
          if (value <= 100) intent.discountPercent = value;
          else
            warnings.push(
              'Diskon persen tidak boleh lebih dari 100. Isi ulang diskonnya.',
            );
        } else if (Number.isInteger(value)) draft.discount = value;
        else
          warnings.push(
            'Diskon rupiah harus bilangan bulat. Isi ulang diskonnya.',
          );
      } else if (Number.isInteger(value)) draft.additionalFee = value;
      else
        warnings.push(
          'Biaya tambahan rupiah harus bilangan bulat. Isi ulang nominalnya.',
        );
      continue;
    }
    if (/^(?:catatan|notes?|pesan)\b/i.test(clause)) {
      draft.notes = [
        draft.notes,
        clean(clause.replace(/^(?:catatan|notes?|pesan)\s*[:=]?/i, '')),
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 2000);
      continue;
    }
    if (
      /^(?:kirim|send|hapus|delete|ubah|ganti|bayar|transfer|email|wa|whatsapp|buat|bikin|invoice|tagihan)\b/i.test(
        clause,
      )
    ) {
      warnings.push(
        `Instruksi "${clause}" belum diterapkan. Draft hanya menyiapkan rincian invoice; periksa dan lakukan aksi tersebut secara terpisah.`,
      );
      continue;
    }
    // A connector between priced items is safe to split; other "dan" stays part of a name.
    const joined = clause.split(
      /\s+(?:dan|and)\s+(?=[^,]*(?:\brp\b|\bribu\b|\bjuta\b|\bharga\b|\bthousand\b|\bmillion\b|\bprice\b))/i,
    );
    for (const itemClause of joined) {
      if (draft.items.length >= 100) {
        warnings.push(
          'Jumlah item melebihi 100; periksa item yang belum ditambahkan.',
        );
        break;
      }
      const parsed = parseItem(itemClause, warnings);
      if (parsed) {
        if (parsed.priceMissing)
          intent.missingPriceIndexes.push(draft.items.length);
        if (parsed.unitMissing)
          intent.missingUnitIndexes.push(draft.items.length);
        draft.items.push(parsed.item);
      }
    }
  }
  if (!draft.customerName)
    warnings.push(
      'Pelanggan belum disebutkan. Pilih pelanggan yang benar sebelum menyimpan.',
    );
  if (!dueProvided)
    warnings.push(
      'Jatuh tempo belum disebutkan; sementara diisi 7 hari dari hari ini.',
    );
  if (new Date(draft.dueDate) < new Date(draft.issueDate))
    warnings.push(
      'Jatuh tempo lebih awal daripada tanggal invoice. Perbaiki tanggal sebelum menyimpan.',
    );
  syncLegacyDraft(draft);
  return intent;
}
