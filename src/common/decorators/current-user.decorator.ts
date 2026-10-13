import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../modules/auth/interfaces/auth-user.interface.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedPrincipal }>();
    return request.user;
  },
);
