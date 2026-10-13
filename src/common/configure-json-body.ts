import type { INestApplication, RawBodyRequest } from '@nestjs/common';
import { json } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';

export function configureJsonBody(app: INestApplication) {
  const verify = (
    req: IncomingMessage,
    _res: ServerResponse,
    buffer: Buffer,
  ) => {
    (req as RawBodyRequest<IncomingMessage>).rawBody = buffer;
  };
  app.use('/api/v1/subscriptions/payments', json({ limit: '8mb', verify }));
  app.use('/api/v1/business', json({ limit: '1mb', verify }));
  app.use('/api/v1/public/invoices', json({ limit: '3mb', verify }));
  app.use('/api/v1/invoices', json({ limit: '3mb', verify }));
  // Nest detects any registered jsonParser and skips its default JSON parser.
  // Register the fallback explicitly for auth/invoices and preserve webhook bytes.
  app.use(json({ limit: '100kb', verify }));
}
