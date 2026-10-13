export interface SmartInvoiceItem {
  name: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface SmartInvoiceDraft {
  customerName: string;
  customerId?: string;
  items: SmartInvoiceItem[];
  discount: number;
  taxPercent: number;
  additionalFee: number;
  depositAmount: number;
  issueDate: string;
  dueDate: string;
  notes: string;
  templateId?: string;
  // Kept for older clients that can read only a single item.
  itemName: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceDraftResult {
  status: 'DRAFT';
  source: 'TEXT' | 'VOICE';
  needsReview: true;
  reviewWarnings: string[];
  draft: SmartInvoiceDraft;
}

export interface ParsedInvoiceIntent {
  draft: SmartInvoiceDraft;
  reviewWarnings: string[];
  repeatPrevious: boolean;
  repeatQuantity?: number;
  missingPriceIndexes: number[];
  missingUnitIndexes: number[];
  discountPercent?: number;
  depositPercent?: number;
}
