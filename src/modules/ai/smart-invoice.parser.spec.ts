import { describe, expect, it } from 'vitest';
import { parseIndonesianNumber } from './indonesian-number.js';
import { parseSmartInvoice } from './smart-invoice.parser.js';

const now = new Date('2026-10-08T08:00:00Z'); // Thursday, Jakarta.

describe('Indonesian numbers', () => {
  it.each([
    ['150 ribu', 150000],
    ['Rp1.000.000', 1000000],
    ['1,5 juta', 1500000],
    ['seratus lima puluh ribu', 150000],
    ['dua juta lima ratus ribu', 2500000],
    ['sebelas koma lima', 11.5],
    ['dua puluh tiga', 23],
    ['1.5 juta', 1500000],
    ['nol ribu', 0],
  ])('reads %s', (input, result) =>
    expect(parseIndonesianNumber(input)).toBe(result),
  );
  it('does not extract an arbitrary digit from a product name', () => {
    expect(parseIndonesianNumber('Canon G3030')).toBeNull();
  });
});

describe('Smart invoice extraction', () => {
  it('extracts customer, multiple items, explicit DP and weekday without recording payments', () => {
    const result = parseSmartInvoice(
      'Bikin invoice Bu Rina, servis AC dua unit masing-masing 150 ribu, tambah freon 200 ribu, sudah DP 100 ribu, pelunasan Jumat',
      now,
    );
    expect(result.draft.customerName).toBe('Bu Rina');
    expect(result.draft.items).toEqual([
      {
        name: 'servis AC',
        description: '',
        quantity: 2,
        unit: 'unit',
        unitPrice: 150000,
      },
      {
        name: 'freon',
        description: '',
        quantity: 1,
        unit: 'unit',
        unitPrice: 200000,
      },
    ]);
    expect(result.draft.depositAmount).toBe(100000);
    expect(result.draft.dueDate).toBe('2026-10-09T00:00:00.000Z');
    expect(
      result.reviewWarnings.some((warning) => warning.includes('dikonfirmasi')),
    ).toBe(true);
    expect(result.draft.itemName).toBe('servis AC');
    expect(result.draft.quantity).toBe(2);
  });

  it('accepts the spoken pitch when speech recognition produces no punctuation', () => {
    const result = parseSmartInvoice(
      'Bikin invoice Bu Rina servis AC dua unit masing-masing 150 ribu tambah freon 200 ribu sudah DP 100 ribu pelunasan Jumat',
      now,
    );
    expect(result.draft.customerName).toBe('Bu Rina');
    expect(result.draft.items).toMatchObject([
      { name: 'servis AC', quantity: 2, unitPrice: 150000 },
      { name: 'freon', quantity: 1, unitPrice: 200000 },
    ]);
    expect(result.draft.depositAmount).toBe(100000);
    expect(result.draft.dueDate).toBe('2026-10-09T00:00:00.000Z');
  });

  it('does not turn negative settings or quantities into positive amounts', () => {
    const result = parseSmartInvoice(
      'Invoice Rina, freon -2 kg harga 100 ribu, diskon -10 ribu, DP -100 ribu',
      now,
    );
    expect(result.draft.discount).toBe(0);
    expect(result.draft.depositAmount).toBe(0);
    expect(result.draft.items[0].quantity).toBe(1);
    expect(result.reviewWarnings.join(' ')).toContain('bilangan bulat');
    expect(result.reviewWarnings.join(' ')).toContain('Nilai');
  });

  it('extracts a per-unit price and shorthand DP without fake line items', () => {
    const result = parseSmartInvoice(
      'Buat invoice Bu Rina, servis AC 2 unit 150 ribu per unit, DP100.000, pelunasan Jumat',
      now,
    );
    expect(result.draft.items).toEqual([
      {
        name: 'servis AC',
        description: '',
        quantity: 2,
        unit: 'unit',
        unitPrice: 150000,
      },
    ]);
    expect(result.draft.depositAmount).toBe(100000);
  });

  it.each(['Pelanggan: Bu Rina', 'Bu Rina'])(
    'recognizes a clear customer line: %s',
    (firstLine) => {
      const result = parseSmartInvoice(
        `${firstLine}\nServis AC 2 unit 150 ribu`,
        now,
      );
      expect(result.draft.customerName).toBe('Bu Rina');
      expect(result.draft.items).toEqual([
        {
          name: 'Servis AC',
          description: '',
          quantity: 2,
          unit: 'unit',
          unitPrice: 150000,
        },
      ]);
    },
  );

  it('reads Rp grouping, tax decimals and money settings independently', () => {
    const { draft } = parseSmartInvoice(
      'Invoice untuk Budi, Hosting 2 paket harga Rp. 1.000.000, diskon 50.000, pajak 11.5 persen, biaya tambahan 25 ribu, jatuh tempo dalam tiga hari',
      now,
    );
    expect(draft.items[0]).toMatchObject({
      name: 'Hosting',
      quantity: 2,
      unitPrice: 1000000,
    });
    expect(draft.discount).toBe(50000);
    expect(draft.taxPercent).toBe(11.5);
    expect(draft.additionalFee).toBe(25000);
    expect(draft.dueDate).toBe('2026-10-11T00:00:00.000Z');
  });

  it('supports customers and items on the same clause', () => {
    const { draft } = parseSmartInvoice(
      'buat invoice untuk Pak Budi item Service motor sebanyak tiga harga 75 ribu, jatuh tempo besok',
      now,
    );
    expect(draft.customerName).toBe('Pak Budi');
    expect(draft.items[0]).toMatchObject({
      name: 'Service motor',
      quantity: 3,
      unitPrice: 75000,
    });
    expect(draft.dueDate).toBe('2026-10-09T00:00:00.000Z');
  });

  it('keeps missing values visibly unresolved rather than inventing customer or price', () => {
    const result = parseSmartInvoice('item Servis AC', now);
    expect(result.draft.customerName).toBe('');
    expect(result.draft.items[0].unitPrice).toBe(0);
    expect(result.missingPriceIndexes).toEqual([0]);
    expect(result.reviewWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Pelanggan belum'),
        expect.stringContaining('Jatuh tempo belum'),
        expect.stringContaining('Jumlah'),
      ]),
    );
  });

  it('does not convert a product model number into a price', () => {
    const result = parseSmartInvoice('Invoice Budi, Printer Canon G3030', now);
    expect(result.draft.items[0]).toMatchObject({
      name: 'Printer Canon G3030',
      unitPrice: 0,
    });
    expect(result.missingPriceIndexes).toEqual([0]);
  });

  it('preserves unknown action instructions as warnings instead of fake items', () => {
    const result = parseSmartInvoice(
      'Invoice Rina, servis AC 150 ribu, kirim langsung ke WhatsApp dan hapus invoice lama',
      now,
    );
    expect(result.draft.items).toHaveLength(1);
    expect(
      result.reviewWarnings.some((warning) =>
        warning.includes('belum diterapkan'),
      ),
    ).toBe(true);
  });

  it('extracts repeat intent and quantity without supplying invented history', () => {
    const result = parseSmartInvoice(
      'Bikin tagihan Pak Budi seperti kemarin, jumlahnya tiga',
      now,
    );
    expect(result.draft.customerName).toBe('Pak Budi');
    expect(result.repeatPrevious).toBe(true);
    expect(result.repeatQuantity).toBe(3);
    expect(result.draft.items).toEqual([]);
  });

  it('rejects fractional quantities into a visible review default', () => {
    const result = parseSmartInvoice(
      'Invoice Rina, freon 1.5 kg harga 100 ribu',
      now,
    );
    expect(result.draft.items[0].quantity).toBe(1);
    expect(
      result.reviewWarnings.some((warning) =>
        warning.includes('bilangan bulat'),
      ),
    ).toBe(true);
  });

  it('does not accept impossible explicit dates', () => {
    const result = parseSmartInvoice(
      'Invoice Rina, servis 100 ribu, jatuh tempo 31/02/2027',
      now,
    );
    expect(result.draft.dueDate).toBe('2026-10-15T00:00:00.000Z');
    expect(
      result.reviewWarnings.some((warning) =>
        warning.includes('belum dapat dibaca'),
      ),
    ).toBe(true);
  });

  it('uses Jakarta calendar date across UTC midnight', () => {
    const { draft } = parseSmartInvoice(
      'Invoice Rina, freon Rp200.000, pelunasan lusa',
      new Date('2026-10-08T18:00:00Z'),
    );
    expect(draft.issueDate).toBe('2026-10-09T00:00:00.000Z');
    expect(draft.dueDate).toBe('2026-10-11T00:00:00.000Z');
  });

  it('supports basic English commands with the same review contract', () => {
    const { draft } = parseSmartInvoice(
      'Create invoice for Rina, AC service two units each 150 thousand, add freon 200 thousand, paid deposit 100 thousand, due Friday',
      now,
    );
    expect(draft.customerName).toBe('Rina');
    expect(draft.items).toEqual([
      {
        name: 'AC service',
        description: '',
        quantity: 2,
        unit: 'units',
        unitPrice: 150000,
      },
      {
        name: 'freon',
        description: '',
        quantity: 1,
        unit: 'unit',
        unitPrice: 200000,
      },
    ]);
    expect(draft.depositAmount).toBe(100000);
    expect(draft.dueDate).toBe('2026-10-09T00:00:00.000Z');
  });
});
