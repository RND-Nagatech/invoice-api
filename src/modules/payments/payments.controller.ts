import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import {
  CreatePaymentDto,
  PaymentWebhookDto,
  PaymentQueryDto,
  RejectPaymentDto,
} from './dto/payment.dto.js';
import { PaymentsService } from './payments.service.js';
import { SkipApiResponse } from '../../common/decorators/skip-api-response.decorator.js';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Get() @ApiBearerAuth() @UseGuards(JwtAuthGuard) list(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: PaymentQueryDto,
  ) {
    return this.payments.list(user, query.invoiceId);
  }
  @Get(':id') @ApiBearerAuth() @UseGuards(JwtAuthGuard) get(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.payments.get(user, id);
  }
  @Post() @ApiBearerAuth() @UseGuards(JwtAuthGuard) create(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.payments.create(user, dto);
  }
  @Post(':id/confirm-manual')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  confirmManual(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.payments.confirmManual(user, id);
  }
  @Get(':id/proof')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @SkipApiResponse()
  async proof(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const image = await this.payments.proof(user, id);
    response.set({
      'Content-Type': image.mime,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(image.buffer);
  }
  @Post(':id/reject-manual')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  reject(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: RejectPaymentDto,
  ) {
    return this.payments.rejectManual(user, id, dto.reason);
  }
  @Post('webhook/singapay')
  singapayWebhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const rawBody = request.rawBody?.toString('utf8');
    if (!rawBody)
      throw new BadRequestException('SingaPay webhook raw body is missing.');
    return this.payments.singapayWebhook(rawBody, headers);
  }
  @Post('webhook/:provider') webhook(
    @Param('provider') provider: string,
    @Headers('x-payment-signature') signature: string | undefined,
    @Body() dto: PaymentWebhookDto,
  ) {
    return this.payments.webhook(provider, signature, dto);
  }
}
