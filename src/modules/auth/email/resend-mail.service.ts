import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ResendMailService {
  private readonly logger = new Logger(ResendMailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendBillingReview(
    to: string,
    subject: string,
    html: string,
    proof: Buffer,
    mime: string,
  ): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('RESEND_FROM_EMAIL');
    if (!apiKey || !from)
      throw new ServiceUnavailableException(
        'Layanan email belum dikonfigurasi.',
      );
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        attachments: [
          {
            filename: mime === 'image/jpeg' ? 'bukti.jpg' : 'bukti.png',
            content: proof.toString('base64'),
          },
        ],
      }),
    });
    if (!response.ok)
      throw new ServiceUnavailableException('Email review belum terkirim.');
  }

  async sendReminder(
    to: string,
    subject: string,
    text: string,
    key: string,
  ): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('RESEND_FROM_EMAIL');
    if (!apiKey || !from)
      throw new ServiceUnavailableException(
        'Layanan email belum dikonfigurasi.',
      );
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!response.ok)
      throw new ServiceUnavailableException('Pengingat email belum terkirim.');
  }

  async sendReceipt(
    to: string,
    details: {
      receiptNumber: string;
      invoiceNumber: string;
      customerName: string;
      amount: number;
      paymentMethod: string;
      issuedAt: Date;
      idempotencyKey: string;
    },
  ): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const from = this.config.get<string>('RESEND_FROM_EMAIL')?.trim();
    if (!apiKey || !from)
      throw new ServiceUnavailableException(
        'Layanan email belum dikonfigurasi.',
      );

    const amount = `Rp ${new Intl.NumberFormat('id-ID').format(details.amount)}`;
    const issuedAt = new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'long',
      timeZone: 'Asia/Jakarta',
    }).format(details.issuedAt);
    const paymentMethod = details.paymentMethod.trim() || 'Pembayaran';
    const safe = (value: string) =>
      value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': details.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Kwitansi ${details.receiptNumber} - InvoiceKilat`,
        text: `Halo ${details.customerName},\n\nPembayaran untuk invoice ${details.invoiceNumber} sudah diterima.\nNomor kwitansi: ${details.receiptNumber}\nNominal: ${amount}\nMetode: ${paymentMethod}\nTanggal: ${issuedAt}\n\nSimpan email ini sebagai bukti pembayaran.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#161335;max-width:560px"><h2 style="color:#5728f5">Kwitansi pembayaran</h2><p>Halo ${safe(details.customerName)},</p><p>Pembayaran untuk invoice <strong>${safe(details.invoiceNumber)}</strong> sudah diterima.</p><table style="border-collapse:collapse;width:100%"><tr><td style="padding:8px 0;color:#6b7280">Nomor kwitansi</td><td style="padding:8px 0;text-align:right;font-weight:700">${safe(details.receiptNumber)}</td></tr><tr><td style="padding:8px 0;color:#6b7280">Nominal</td><td style="padding:8px 0;text-align:right;font-weight:700">${amount}</td></tr><tr><td style="padding:8px 0;color:#6b7280">Metode</td><td style="padding:8px 0;text-align:right">${safe(paymentMethod)}</td></tr><tr><td style="padding:8px 0;color:#6b7280">Tanggal</td><td style="padding:8px 0;text-align:right">${issuedAt}</td></tr></table><p style="color:#6b7280">Simpan email ini sebagai bukti pembayaran.</p></div>`,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        `Resend rejected receipt email (${response.status}): ${body.slice(0, 500)}`,
      );
      throw new ServiceUnavailableException('Email kwitansi belum terkirim.');
    }
  }

  async sendPasswordResetOtp(
    to: string,
    otp: string,
    expiresInSeconds: number,
  ): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const from = this.config.get<string>('RESEND_FROM_EMAIL')?.trim();
    const nodeEnv = this.config.get<string>('NODE_ENV')?.trim();
    const testRecipient = this.config
      .get<string>('RESEND_TEST_RECIPIENT')
      ?.trim();
    if (!apiKey || !from) {
      throw new ServiceUnavailableException(
        'Layanan email belum dikonfigurasi. Hubungi administrator.',
      );
    }

    // Resend's onboarding sender can be used for local testing before a
    // custom domain is verified. Never allow this recipient redirect in
    // production, where OTPs must go to the account email being reset.
    const recipient =
      nodeEnv !== 'production' && testRecipient ? testRecipient : to;

    const duration = this.formatDuration(expiresInSeconds);
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [recipient],
          subject: 'Kode OTP reset password InvoiceKilat',
          text: `Kode OTP reset password InvoiceKilat Anda adalah ${otp}. Kode berlaku selama ${duration}. Jika Anda tidak meminta reset password, abaikan email ini.`,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#161335"><h2>Reset password InvoiceKilat</h2><p>Gunakan kode OTP berikut untuk membuat password baru:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#5728f5">${otp}</p><p>Kode berlaku selama ${duration}. Jika Anda tidak meminta reset password, abaikan email ini.</p></div>`,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        let providerMessage = body;
        try {
          const parsed = JSON.parse(body) as { message?: unknown };
          if (typeof parsed.message === 'string')
            providerMessage = parsed.message;
        } catch {
          // Keep the raw response only for the server log.
        }
        this.logger.error(
          `Resend rejected OTP email (${response.status}): ${providerMessage}`,
        );
        if (response.status === 401 || response.status === 403) {
          throw new ServiceUnavailableException(
            'API key atau domain pengirim Resend belum valid. Periksa konfigurasi Resend.',
          );
        }
        throw new ServiceUnavailableException(
          'Resend menolak pengiriman email. Periksa domain dan alamat pengirim.',
        );
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        'Kode OTP belum dapat dikirim. Silakan coba lagi.',
      );
    }
  }

  private formatDuration(seconds: number): string {
    const minutes = seconds / 60;
    return Number.isInteger(minutes) ? `${minutes} menit` : `${seconds} detik`;
  }
}
