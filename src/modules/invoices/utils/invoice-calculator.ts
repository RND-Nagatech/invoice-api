import { BadRequestException } from '@nestjs/common';
import type { CreateInvoiceDto } from '../dto/invoice.dto.js';

export function calculateInvoice(
  input: Pick<
    CreateInvoiceDto,
    'items' | 'discount' | 'taxPercent' | 'additionalFee'
  >,
) {
  const items = input.items.map((item) => ({
    name: item.name,
    description: item.description ?? '',
    quantity: item.quantity,
    unit: item.unit || 'unit',
    unitPrice: item.unitPrice,
    lineTotal: item.quantity * item.unitPrice,
  }));
  const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);
  const discount = input.discount ?? 0;
  const taxPercent = input.taxPercent ?? 0;
  const additionalFee = input.additionalFee ?? 0;
  if (!Number.isSafeInteger(subtotal) || discount > subtotal) {
    throw new BadRequestException('Diskon tidak boleh melebihi subtotal.');
  }
  const tax = Math.round(((subtotal - discount) * taxPercent) / 100);
  const total = subtotal - discount + tax + additionalFee;
  if (!Number.isSafeInteger(total) || total > 1_000_000_000_000) {
    throw new BadRequestException('Total invoice terlalu besar.');
  }
  return { items, subtotal, discount, taxPercent, tax, additionalFee, total };
}
