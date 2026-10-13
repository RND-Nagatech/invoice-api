import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { MongooseModule } from '@nestjs/mongoose';
import { BusinessRepository } from '../businesses/repository/business.repository.js';
import {
  Business,
  BusinessSchema,
} from '../businesses/schemas/business.schema.js';
import { UserRepository } from '../users/repository/user.repository.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { ResendMailService } from './email/resend-mail.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import {
  AUTH_REDIS,
  PasswordResetOtpService,
} from './otp/password-reset-otp.service.js';
import { SessionRepository } from './repository/session.repository.js';
import {
  RefreshSession,
  RefreshSessionSchema,
} from './schemas/refresh-session.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Business.name, schema: BusinessSchema },
      { name: RefreshSession.name, schema: RefreshSessionSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    UserRepository,
    BusinessRepository,
    SessionRepository,
    {
      provide: AUTH_REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          maxRetriesPerRequest: null,
        }),
    },
    PasswordResetOtpService,
    ResendMailService,
  ],
  // Keep the guard's repository dependencies available to feature modules.
  exports: [
    ResendMailService,
    JwtAuthGuard,
    BusinessRepository,
    UserRepository,
    SessionRepository,
  ],
})
export class AuthModule {}
