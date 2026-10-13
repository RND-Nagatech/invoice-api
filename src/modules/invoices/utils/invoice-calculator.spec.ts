import { BadRequestException } from '@nestjs/common';
import { calculateInvoice } from './invoice-calculator.js';

describe('invoice totals', () => {
  it('calculates item lines, discount, tax, fee, and total in rupiah', () => {
    expect(
      calculateInvoice({
        items: [
          { name: 'Service AC', quantity: 2, unitPrice: 75_000 },
          { name: 'Transport', quantity: 1, unitPrice: 20_000 },
        ],
        discount: 10_000,
        taxPercent: 11,
        additionalFee: 5_000,
      }),
    ).toMatchObject({
      subtotal: 170_000,
      discount: 10_000,
      tax: 17_600,
      additionalFee: 5_000,
      total: 182_600,
      items: [{ lineTotal: 150_000 }, { lineTotal: 20_000 }],
    });
  });

  it('rejects a discount above the subtotal', () => {
    expect(() =>
      calculateInvoice({
        items: [{ name: 'Service', quantity: 1, unitPrice: 50_000 }],
        discount: 60_000,
      }),
    ).toThrow(BadRequestException);
  });
});
