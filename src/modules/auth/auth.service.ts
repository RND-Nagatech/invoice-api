import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { BusinessRepository } from '../businesses/repository/business.repository.js';
import { UserRepository } from '../users/repository/user.repository.js';
import type { UserDocument } from '../users/schemas/user.schema.js';
import type { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { ResetPasswordDto } from './dto/reset-password.dto.js';
import type { VerifyResetOtpDto } from './dto/verify-reset-otp.dto.js';
import { ResendMailService } from './email/resend-mail.service.js';
import type {
  AccessClaims,
  AuthResponse,
  AuthenticatedPrincipal,
  AuthUser,
  RefreshClaims,
  TokenPair,
} from './interfaces/auth-user.interface.js';
import { PasswordResetOtpService } from './otp/password-reset-otp.service.js';
import { SessionRepository } from './repository/session.repository.js';
import { hashPassword, hashToken, verifyPassword } from './utils/password.js';

const REFRESH_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly businesses: BusinessRepository,
    private readonly sessions: SessionRepository,
    private readonly passwordResetOtp: PasswordResetOtpService,
    private readonly mail: ResendMailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('Email sudah terdaftar.');
    }
    const userId = new Types.ObjectId();
    const businessId = new Types.ObjectId();
    const passwordHash = await hashPassword(dto.password);
    await this.businesses.create(businessId, userId, dto.businessName);
    let user: UserDocument;
    try {
      user = await this.users.create({
        id: userId,
        name: dto.name,
        email: dto.email,
        passwordHash,
        businessId,
      });
    } catch (error) {
      await this.businesses.deleteById(businessId);
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new ConflictException('Email sudah terdaftar.');
      }
      throw error;
    }
    return {
      ...(await this.createSession(user)),
      user: this.toAuthUser(user, dto.businessName),
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    if (!user) {
      // Keep the timing close to a real password check without hiding the
      // actionable account message required by the mobile login flow.
      await hashPassword(dto.password);
      throw new UnauthorizedException(
        'Email belum terdaftar. Silakan daftar terlebih dahulu.',
      );
    }

    const valid = await verifyPassword(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Password salah. Silakan coba lagi.');
    }

    const business = await this.businesses.findById(user.businessId);
    if (!business)
      throw new UnauthorizedException('Akun bisnis tidak ditemukan.');
    return {
      ...(await this.createSession(user)),
      user: this.toAuthUser(user, business.name),
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const claims = await this.verifyRefresh(refreshToken);
    const user = await this.users.findById(claims.sub);
    if (!user || user.businessId.toString() !== claims.businessId) {
      throw new UnauthorizedException('Sesi tidak valid.');
    }
    const next = await this.signPair(user, claims.sid);
    const rotated = await this.sessions.rotate(
      claims.sid,
      claims.sub,
      hashToken(refreshToken),
      hashToken(next.refreshToken),
      new Date(Date.now() + REFRESH_DURATION_MS),
    );
    if (!rotated)
      throw new UnauthorizedException(
        'Refresh token sudah digunakan atau dicabut.',
      );
    return next;
  }

  async logout(
    principal: AuthenticatedPrincipal,
    refreshToken: string,
  ): Promise<{ loggedOut: true }> {
    const claims = await this.verifyRefresh(refreshToken);
    if (claims.sub !== principal.id || claims.sid !== principal.sessionId) {
      throw new UnauthorizedException('Sesi tidak valid.');
    }
    const revoked = await this.sessions.revoke(
      claims.sid,
      claims.sub,
      hashToken(refreshToken),
    );
    if (!revoked) throw new UnauthorizedException('Sesi sudah berakhir.');
    return { loggedOut: true };
  }

  async me(principal: AuthenticatedPrincipal): Promise<AuthUser> {
    const user = await this.users.findById(principal.id);
    if (!user || user.businessId.toString() !== principal.businessId) {
      throw new UnauthorizedException('Sesi tidak valid.');
    }
    const business = await this.businesses.findById(user.businessId);
    if (!business || business.ownerId.toString() !== user.id) {
      throw new UnauthorizedException('Akun bisnis tidak valid.');
    }
    return this.toAuthUser(user, business.name);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{
    accepted: true;
    otpExpiresInSeconds: number;
  }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new NotFoundException(
        'Email belum terdaftar. Silakan daftar terlebih dahulu.',
      );
    }
    const issued = await this.passwordResetOtp.issue(
      email,
      user._id.toString(),
    );
    if (issued.otp) {
      await this.mail.sendPasswordResetOtp(
        user.email,
        issued.otp,
        issued.expiresInSeconds,
      );
    }
    return { accepted: true, otpExpiresInSeconds: issued.expiresInSeconds };
  }

  async verifyResetOtp(
    dto: VerifyResetOtpDto,
  ): Promise<{ resetToken: string }> {
    const resetToken = await this.passwordResetOtp.verify(dto.email, dto.otp);
    return { resetToken };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ passwordReset: true }> {
    const userId = await this.passwordResetOtp.consumeResetToken(
      dto.resetToken,
    );
    if (!userId)
      throw new BadRequestException(
        'Token reset tidak valid atau sudah kedaluwarsa.',
      );
    const passwordHash = await hashPassword(dto.newPassword);
    const objectId = new Types.ObjectId(userId);
    await this.users.updatePassword(objectId, passwordHash);
    await this.sessions.revokeAll(objectId);
    return { passwordReset: true };
  }

  private async createSession(user: UserDocument): Promise<TokenPair> {
    const id = new Types.ObjectId();
    const pair = await this.signPair(user, id.toString());
    await this.sessions.create({
      id,
      userId: user._id,
      businessId: user.businessId,
      tokenHash: hashToken(pair.refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_DURATION_MS),
    });
    return pair;
  }

  private async signPair(
    user: UserDocument,
    sessionId: string,
  ): Promise<TokenPair> {
    const access: AccessClaims = {
      sub: user.id,
      businessId: user.businessId.toString(),
      sid: sessionId,
      typ: 'access',
    };
    const refresh: RefreshClaims = { ...access, typ: 'refresh' };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(access, { expiresIn: '15m', jwtid: randomUUID() }),
      this.jwt.signAsync(refresh, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
        jwtid: randomUUID(),
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async verifyRefresh(token: string): Promise<RefreshClaims> {
    try {
      const claims = await this.jwt.verifyAsync<RefreshClaims>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      if (
        claims.typ !== 'refresh' ||
        !Types.ObjectId.isValid(claims.sub) ||
        !Types.ObjectId.isValid(claims.businessId) ||
        !Types.ObjectId.isValid(claims.sid)
      ) {
        throw new Error('Invalid claims');
      }
      return claims;
    } catch {
      throw new UnauthorizedException(
        'Refresh token tidak valid atau sudah berakhir.',
      );
    }
  }

  private toAuthUser(user: UserDocument, businessName: string): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      businessId: user.businessId.toString(),
      businessName,
    };
  }
}
