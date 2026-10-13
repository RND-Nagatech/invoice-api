import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SkipApiResponse } from '../../common/decorators/skip-api-response.decorator.js';
import { InvoicesService } from './invoices.service.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import { renderPublicInvoicePage } from './public-invoice-page.js';
import {
  PaymentPromiseDto,
  RepeatOrderDto,
} from './dto/customer-experience.dto.js';

@ApiTags('public-invoices')
@Controller('public/invoices')
export class PublicInvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly pdf: InvoicePdfService,
  ) {}

  @Get(':publicId/pdf')
  @SkipApiResponse()
  async pdfFile(
    @Param('publicId') publicId: string,
    @Res() response: Response,
  ): Promise<void> {
    const identity = await this.invoices.publicInvoiceIdentity(publicId);
    const data = await this.pdf.render(identity.businessId, identity.id);
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${identity.invoiceNumber}.pdf"`,
      'Content-Length': data.length.toString(),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
    });
    response.end(data);
  }

  @Get(':publicId/view')
  @SkipApiResponse()
  async view(
    @Param('publicId') publicId: string,
    @Res() response: Response,
  ): Promise<void> {
    const data = await this.invoices.publicPreview(publicId);
    const nonce = randomBytes(16).toString('base64');
    response.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'`,
    });
    response.send(renderPublicInvoicePage(data, publicId, nonce));
  }

  @Post(':publicId/promise')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  promise(@Param('publicId') publicId: string, @Body() dto: PaymentPromiseDto) {
    return this.invoices.promisePayment(publicId, dto);
  }

  @Post(':publicId/repeat-order')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  repeat(@Param('publicId') publicId: string, @Body() dto: RepeatOrderDto) {
    return this.invoices.requestRepeat(publicId, dto);
  }

  @Get(':publicId/service-photos/:index')
  @SkipApiResponse()
  async photo(
    @Param('publicId') publicId: string,
    @Param('index') index: string,
    @Res() response: Response,
  ) {
    const image = await this.invoices.publicServicePhoto(
      publicId,
      /^\d$/.test(index) ? Number(index) : -1,
    );
    response.set({
      'Content-Type': image.mime,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(image.buffer);
  }

  @Get(':publicId')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  @Header('Referrer-Policy', 'no-referrer')
  async get(@Param('publicId') publicId: string) {
    return this.invoices.publicPreview(publicId);
  }
}
