import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SingaPay, type VerifiedWebhook } from '@aliziodev/singapay';

export interface SingaPayPaymentLink {
  providerReference: string;
  checkoutUrl: string;
  gatewayId?: string;
}

/**
 * Server-only SingaPay adapter. Credentials are read only from environment
 * variables and never leave this process or reach the Flutter client.
 */
@Injectable()
export class SingaPayProvider {
  private readonly client: SingaPay | null;
  private readonly webhookPath: string;

  constructor(private readonly config: ConfigService) {
    this.webhookPath =
      this.config.get<string>('SINGAPAY_WEBHOOK_PATH') ??
      '/api/v1/payments/webhook/singapay';
    const enabled = this.config.get<string>('SINGAPAY_ENABLED') === 'true';
    const clientId = this.config.get<string>('SINGAPAY_CLIENT_ID')?.trim();
    const clientSecret = this.config
      .get<string>('SINGAPAY_CLIENT_SECRET')
      ?.trim();
    const apiKey = this.config.get<string>('SINGAPAY_API_KEY')?.trim();
    if (!enabled || !clientId || !clientSecret || !apiKey) {
      this.client = null;
      return;
    }
    const hmacKeys = (this.config.get<string>('SINGAPAY_HMAC_KEY') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    this.client = new SingaPay({
      environment:
        this.config.get<'sandbox' | 'production'>('SINGAPAY_ENVIRONMENT') ??
        'sandbox',
      clientId,
      clientSecret,
      apiKey,
      accountId: this.config.get<string>('SINGAPAY_ACCOUNT_ID')?.trim(),
      authVersion:
        this.config.get<'1.0' | '1.1'>('SINGAPAY_AUTH_VERSION') ?? '1.1',
      timeoutMs: Number(
        this.config.get<string>('SINGAPAY_TIMEOUT_MS') ?? 30_000,
      ),
      webhooks: { secrets: hmacKeys },
    });
  }

  get configured(): boolean {
    return this.client !== null;
  }
  get callbackPath(): string {
    return this.webhookPath;
  }

  private requireClient(): SingaPay {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'SingaPay belum dikonfigurasi. Isi SINGAPAY_* pada environment backend.',
      );
    }
    return this.client;
  }

  async createPaymentLink(
    reference: string,
    amount: number,
  ): Promise<SingaPayPaymentLink> {
    const response = await this.requireClient().paymentLinks.create({
      reff_no: reference,
      payment_link_type: 'total',
      total_amount: amount,
      max_usage: 1,
    });
    const data = (response.data ?? {}) as Record<string, unknown>;
    const checkoutUrl =
      this.asString(data.payment_url) ??
      this.asString(data.checkout_url) ??
      this.asString(data.payment_link) ??
      '';
    if (!checkoutUrl)
      throw new ServiceUnavailableException(
        'SingaPay tidak mengembalikan payment URL.',
      );
    return {
      providerReference: reference,
      checkoutUrl,
      gatewayId: this.asString(data.id),
    };
  }

  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<VerifiedWebhook> {
    return this.requireClient().verifyWebhook(
      rawBody,
      headers,
      this.webhookPath,
    );
  }

  private asString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
    return undefined;
  }
}
