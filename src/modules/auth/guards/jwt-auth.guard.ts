import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { UserRepository } from '../../users/repository/user.repository.js';
import type {
  AccessClaims,
  AuthenticatedPrincipal,
} from '../interfaces/auth-user.interface.js';
import { SessionRepository } from '../repository/session.repository.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthenticatedPrincipal;
    }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer '))
      throw new UnauthorizedException('Sesi tidak valid.');
    const token = header.slice(7);
    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token);
    } catch {
      throw new UnauthorizedException('Sesi tidak valid atau sudah berakhir.');
    }
    if (
      claims.typ !== 'access' ||
      !Types.ObjectId.isValid(claims.sub) ||
      !Types.ObjectId.isValid(claims.businessId) ||
      !Types.ObjectId.isValid(claims.sid)
    ) {
      throw new UnauthorizedException('Sesi tidak valid.');
    }
    const [user, active] = await Promise.all([
      this.users.findById(claims.sub),
      this.sessions.isActive(claims.sid, claims.sub),
    ]);
    if (!user || !active || user.businessId.toString() !== claims.businessId) {
      throw new UnauthorizedException('Sesi tidak valid.');
    }
    request.user = {
      id: claims.sub,
      businessId: claims.businessId,
      sessionId: claims.sid,
    };
    return true;
  }
}
