import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import type { VoiceInvoiceDto, TextInvoiceDraftDto } from './dto/ai.dto.js';
import { AiDraftContextRepository } from './repository/ai-draft-context.repository.js';
import { AiVoiceUsageRepository } from './repository/ai-voice-usage.repository.js';
import { parseSmartInvoice, syncLegacyDraft } from './smart-invoice.parser.js';
import type { InvoiceDraftResult } from './smart-invoice.types.js';
import { normalizeSharedChat } from './shared-chat.js';
export type { InvoiceDraftResult } from './smart-invoice.types.js';

@Injectable()
export class AiService {
  constructor(
    private readonly context: AiDraftContextRepository,
    private readonly usageRepository: AiVoiceUsageRepository,
    private readonly subscriptions: SubscriptionsService,
    private readonly config: ConfigService,
  ) {}

  private voiceLimit(): number {
    const configured = Number(
      this.config.get('AI_FREE_VOICE_TRIAL_LIMIT') ?? 3,
    );
    return Number.isInteger(configured) && configured >= 0 && configured <= 100
      ? configured
      : 3;
  }

  async usage(user: AuthenticatedPrincipal) {
    const [subscription, used] = await Promise.all([
      this.subscriptions.current(user),
      this.usageRepository.used(user.businessId),
    ]);
    const limit = this.voiceLimit();
    const isPro = subscription.planId === 'PRO';
    return {
      isPro,
      voiceTrialLimit: limit,
      voiceTrialUsed: used,
      voiceTrialRemaining: isPro ? null : Math.max(0, limit - used),
    };
  }

  text(
    user: AuthenticatedPrincipal,
    dto: TextInvoiceDraftDto,
  ): Promise<InvoiceDraftResult> {
    return this.parse(user.businessId, dto.text, 'TEXT');
  }

  async voice(
    user: AuthenticatedPrincipal,
    dto: VoiceInvoiceDto,
  ): Promise<InvoiceDraftResult> {
    if (!dto.transcript?.trim())
      throw new BadRequestException(
        dto.audioBase64
          ? 'Transkrip suara belum tersedia. Kirim transcript dari speech-to-text perangkat.'
          : 'Transcript suara wajib diisi.',
      );
    const subscription = await this.subscriptions.current(user);
    const isPro = subscription.planId === 'PRO';
    // Consume only after a draft was successfully produced. The conditional
    // update guarantees concurrent requests cannot exceed the lifetime limit.
    const result = await this.parse(user.businessId, dto.transcript, 'VOICE');
    const consumption = isPro
      ? 'ACCEPTED'
      : await this.usageRepository.consume(
          user.businessId,
          this.voiceLimit(),
          dto.requestId
            ? {
                requestId: dto.requestId,
                transcriptHash: createHash('sha256')
                  .update(dto.transcript.trim())
                  .digest('hex'),
              }
            : undefined,
        );
    if (consumption === 'REQUEST_REUSED')
      throw new BadRequestException(
        'requestId sudah digunakan untuk transkrip yang berbeda. Gunakan requestId baru untuk draft baru.',
      );
    if (consumption === 'EXHAUSTED') {
      throw new ForbiddenException({
        code: 'PRO_REQUIRED',
        message:
          'Percobaan invoice dari suara paket Free sudah habis. Berlangganan Pro untuk memakai suara tanpa batas.',
        details: {
          feature: 'voice',
          upgradePath: '/subscription',
          voiceTrialLimit: this.voiceLimit(),
        },
      });
    }
    return result;
  }

  private async parse(
    businessId: string,
    text: string,
    source: 'TEXT' | 'VOICE',
  ): Promise<InvoiceDraftResult> {
    if (!text.trim())
      throw new BadRequestException('Teks untuk draft invoice wajib diisi.');
    const intent = parseSmartInvoice(normalizeSharedChat(text));
    const { draft, reviewWarnings: warnings } = intent;
    if (draft.customerName) {
      const matches = await this.context.exactCustomers(
        businessId,
        draft.customerName,
      );
      if (matches.length === 1) {
        draft.customerId = matches[0]._id.toString();
        draft.customerName = matches[0].name;
      } else
        warnings.push(
          matches.length > 1
            ? `Nama "${draft.customerName}" cocok dengan lebih dari satu pelanggan. Pilih pelanggan secara manual.`
            : `Pelanggan "${draft.customerName}" belum ditemukan dengan nama yang persis sama. Pilih atau tambahkan pelanggan sebelum menyimpan.`,
        );
    }
    if (intent.repeatPrevious) {
      const previous = draft.customerId
        ? await this.context.latestInvoice(businessId, draft.customerId)
        : null;
      if (!previous)
        warnings.push(
          'Invoice sebelumnya belum ditemukan untuk pelanggan yang dipilih. Isi item secara manual.',
        );
      else if (draft.items.length)
        warnings.push(
          'Permintaan mengulang invoice disertai item baru belum dapat digabung dengan aman. Item baru dipakai; periksa rincian sebelum menyimpan.',
        );
      else {
        draft.items = previous.items.map((item) => {
          if (!Number.isInteger(item.quantity))
            warnings.push(
              `Jumlah "${item.name}" pada invoice sebelumnya memiliki pecahan; sementara diisi 1. Periksa jumlah item.`,
            );
          return {
            name: item.name,
            description: item.description ?? '',
            quantity: Number.isInteger(item.quantity) ? item.quantity : 1,
            unit: item.unit ?? 'unit',
            unitPrice: item.unitPrice,
          };
        });
        draft.templateId = previous.templateId;
        if (intent.repeatQuantity !== undefined) {
          if (draft.items.length === 1)
            draft.items[0].quantity = intent.repeatQuantity;
          else
            warnings.push(
              'Invoice sebelumnya memiliki beberapa item. Permintaan jumlah baru belum diterapkan karena item yang dimaksud belum jelas.',
            );
        }
        warnings.push(
          `Item dan harga diambil dari invoice ${previous.invoiceNumber}. Periksa jumlah, harga, diskon, pajak, dan tanggal; pembayaran lama tidak disalin.`,
        );
      }
    }
    for (const index of intent.missingPriceIndexes) {
      const item = draft.items[index];
      if (!item) continue;
      const catalog = await this.context.exactCatalogItems(
        businessId,
        item.name,
      );
      if (
        catalog.length === 1 &&
        Number.isInteger(catalog[0].defaultPrice) &&
        catalog[0].defaultPrice >= 0 &&
        catalog[0].defaultPrice <= 1_000_000_000
      ) {
        item.unitPrice = catalog[0].defaultPrice;
        item.description ||= catalog[0].description;
        if (intent.missingUnitIndexes.includes(index))
          item.unit = catalog[0].unit || 'unit';
        warnings.push(
          `Harga "${item.name}" diambil dari katalog bisnis Anda. Pastikan harga tersebut masih berlaku.`,
        );
      } else
        warnings.push(
          catalog.length > 1
            ? `Ada beberapa harga katalog untuk "${item.name}". Pilih harga yang benar; sementara diisi Rp0.`
            : `Harga "${item.name}" belum disebutkan dan belum ditemukan pada katalog. Isi harga satuan; sementara diisi Rp0.`,
        );
    }
    if (!draft.items.length)
      warnings.push(
        'Belum ada item yang dapat disiapkan. Tambahkan item sebelum menyimpan invoice.',
      );
    const subtotal = draft.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    if (intent.discountPercent !== undefined)
      draft.discount = Math.round((subtotal * intent.discountPercent) / 100);
    const afterDiscount = Math.max(0, subtotal - draft.discount);
    const total =
      afterDiscount +
      Math.round((afterDiscount * draft.taxPercent) / 100) +
      draft.additionalFee;
    if (intent.depositPercent !== undefined) {
      draft.depositAmount = Math.round((total * intent.depositPercent) / 100);
      warnings.push(
        `DP ${intent.depositPercent}% dihitung dari total setelah diskon dan pajak. Pastikan nominalnya sesuai kesepakatan.`,
      );
    }
    if (draft.discount > subtotal)
      warnings.push(
        'Diskon melebihi subtotal item. Perbaiki diskon sebelum menyimpan.',
      );
    if (draft.depositAmount > total)
      warnings.push(
        'DP melebihi total invoice. Perbaiki nominal DP sebelum mencatat pembayaran.',
      );
    syncLegacyDraft(draft);
    return {
      status: 'DRAFT',
      source,
      needsReview: true,
      reviewWarnings: [...new Set(warnings)],
      draft,
    };
  }
}
