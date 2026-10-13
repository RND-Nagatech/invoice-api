import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector = new Reflector()) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (
      this.reflector.getAllAndOverride<boolean>('skipApiResponse', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return next.handle();
    return next
      .handle()
      .pipe(
        map((data: unknown) => ({ success: true, data, message: 'Success' })),
      );
  }
}
