import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const databaseCollectionLimit = this.isCollectionLimitError(exception);
    const status = databaseCollectionLimit
      ? HttpStatus.SERVICE_UNAVAILABLE
      : exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException ? exception.getResponse() : null;
    const payloadObject =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : null;
    const rawMessage = payloadObject?.message ?? payload;
    const message = databaseCollectionLimit
      ? 'Database sudah mencapai batas jumlah koleksi MongoDB. Hapus koleksi yang tidak dipakai atau upgrade cluster.'
      : status === HttpStatus.INTERNAL_SERVER_ERROR
        ? 'Terjadi kesalahan pada server.'
        : Array.isArray(rawMessage)
          ? rawMessage.join('; ')
          : typeof rawMessage === 'string'
            ? rawMessage
            : 'Permintaan tidak dapat diproses.';
    const code = databaseCollectionLimit
      ? 'DATABASE_LIMIT'
      : status === HttpStatus.BAD_REQUEST
        ? 'VALIDATION_ERROR'
        : status === HttpStatus.NOT_FOUND
          ? 'NOT_FOUND'
          : status === HttpStatus.SERVICE_UNAVAILABLE
            ? 'SERVICE_UNAVAILABLE'
            : status >= 500
              ? 'INTERNAL_ERROR'
              : 'REQUEST_ERROR';

    if (status >= 500 && !(exception instanceof HttpException)) {
      const detail =
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : String(exception);
      this.logger.error(`${request.method} ${request.url}: ${detail}`);
    }
    response.status(status).json({
      success: false,
      error: {
        code:
          typeof payloadObject?.code === 'string' ? payloadObject.code : code,
        message,
        details: payloadObject?.details ?? null,
      },
    });
  }

  private isCollectionLimitError(exception: unknown): boolean {
    if (!exception || typeof exception !== 'object') return false;
    const error = exception as { code?: unknown; message?: unknown };
    return (
      error.code === 8000 &&
      typeof error.message === 'string' &&
      error.message.includes('collections of 500')
    );
  }
}
