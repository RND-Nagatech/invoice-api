import { normalizeSharedChat } from './shared-chat.js';
import { parseSmartInvoice } from './smart-invoice.parser.js';

describe('WhatsApp shared orders', () => {
  it('removes export timestamps and speaker labels without mistaking them for quantities', () => {
    const raw =
      '[14.52, 09/10/2026] Rina: Pelanggan Bu Rina\n9/10/2026, 14:53 - Rina: Servis printer 2 unit @ Rp 150.000\n[14.54, 09/10/2026] Rina: DP Rp 100.000\n<Media omitted>';
    const text = normalizeSharedChat(raw);
    expect(text).toBe(
      'Pelanggan Bu Rina\nServis printer 2 unit @ Rp 150.000\nDP Rp 100.000',
    );
    expect(parseSmartInvoice(text).draft.items[0]).toMatchObject({
      quantity: 2,
      unitPrice: 150000,
    });
  });
  it('leaves a plain copied message intact', () => {
    const text =
      'Pelanggan: Bu Rina\n2 unit servis @ 150rb\nJatuh tempo 7 hari';
    expect(normalizeSharedChat(text)).toBe(text);
  });
});
