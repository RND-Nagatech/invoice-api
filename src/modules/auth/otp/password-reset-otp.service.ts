import {
  BadRequestException,
  Inject,
  Injectable,
  HttpException,
  HttpStatus,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { randomBytes, randomInt } from 'node:crypto';
import { hashToken } from '../utils/password.js';

export const AUTH_REDIS = Symbol('AUTH_REDIS');

const RESET_TOKEN_TTL_SECONDS = 10 * 60;
const REQUEST_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

interface OtpRecord {
  userId: string;
  otpHash: string;
  attempts: number;
}

export interface IssuedPasswordResetOtp {
  otp: string | null;
  expiresInSeconds: number;
}

@Injectable()
export class PasswordResetOtpService implements OnModuleDestroy {
  constructor(
    @Inject(AUTH_REDIS) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async issue(email: string, userId?: string): Promise<IssuedPasswordResetOtp> {
    const expiresInSeconds = this.otpTtlSeconds();
    const normalizedEmail = this.normalizeEmail(email);
    const cooldownKey = this.cooldownKey(normalizedEmail);
    const accepted = await this.redis.set(
      cooldownKey,
      '1',
      'EX',
      REQUEST_COOLDOWN_SECONDS,
      'NX',
    );
    if (accepted === null) {
      throw new HttpException(
        'Tunggu sebentar sebelum meminta kode OTP lagi.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!userId) return { otp: null, expiresInSeconds };

    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const record: OtpRecord = {
      userId,
      otpHash: hashToken(otp),
      attempts: 0,
    };
    await this.redis.set(
      this.otpKey(normalizedEmail),
      JSON.stringify(record),
      'EX',
      expiresInSeconds,
    );
    return { otp, expiresInSeconds };
  }

  async verify(email: string, otp: string): Promise<string> {
    const normalizedEmail = this.normalizeEmail(email);
    const key = this.otpKey(normalizedEmail);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new BadRequestException(
        'Kode OTP sudah kedaluwarsa. Silakan kirim ulang kode baru.',
      );
    }

    let record: OtpRecord;
    try {
      record = JSON.parse(raw) as OtpRecord;
    } catch {
      await this.redis.del(key);
      throw new BadRequestException(
        'Kode OTP tidak valid. Silakan kirim ulang.',
      );
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new BadRequestException(
        'Terlalu banyak percobaan. Silakan kirim ulang kode OTP.',
      );
    }

    if (!/^\d{6}$/.test(otp) || hashToken(otp) !== record.otpHash) {
      const locked = await this.bumpAttempts(key, record);
      throw new BadRequestException(
        locked
          ? 'Terlalu banyak percobaan. Silakan kirim ulang kode OTP.'
          : 'Kode OTP salah. Periksa kembali kode Anda.',
      );
    }

    await this.redis.del(key);
    const resetToken = randomBytes(32).toString('base64url');
    await this.redis.set(
      this.resetTokenKey(hashToken(resetToken)),
      record.userId,
      'EX',
      RESET_TOKEN_TTL_SECONDS,
    );
    return resetToken;
  }

  async consumeResetToken(resetToken: string): Promise<string | null> {
    if (!resetToken || resetToken.length > 256) return null;
    return this.redis.getdel(this.resetTokenKey(hashToken(resetToken)));
  }

  private async bumpAttempts(key: string, record: OtpRecord): Promise<boolean> {
    record.attempts += 1;
    if (record.attempts >= MAX_ATTEMPTS) {
      await this.redis.del(key);
      return true;
    }
    const ttl = await this.redis.ttl(key);
    if (ttl > 0) {
      await this.redis.set(key, JSON.stringify(record), 'EX', ttl);
    }
    return false;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private otpTtlSeconds(): number {
    return (
      this.config.getOrThrow<number>('PASSWORD_RESET_OTP_TTL_MINUTES') * 60
    );
  }

  private otpKey(email: string): string {
    return `password-reset:otp:${email}`;
  }

  private cooldownKey(email: string): string {
    return `password-reset:cooldown:${email}`;
  }

  private resetTokenKey(tokenHash: string): string {
    return `password-reset:token:${tokenHash}`;
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
