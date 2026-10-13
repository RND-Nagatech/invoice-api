import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import {
  CheckoutSubscriptionDto,
  SubmitProofDto,
} from './dto/subscription.dto.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { BillingService } from './billing.service.js';

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {}
  @Get('current') current(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.subscriptions.current(user);
  }
  @Get('plans') plans() {
    return this.subscriptions.plans();
  }
  @Get('usage') usage(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.subscriptions.usage(user);
  }
  @Post('checkout') checkout(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() _dto: CheckoutSubscriptionDto,
  ) {
    return this.billing.checkout(user);
  }
  @Post('cancel') cancel(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.subscriptions.cancel(user);
  }
  @Get('payment') latest(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.billing.latest(user);
  }
  @Get('qris') async qris(@Res() res: Response) {
    if (this.config.get('SUBSCRIPTION_PAYMENT_MODE') !== 'manual')
      throw new NotFoundException(
        'QRIS pembayaran tidak tersedia dalam mode demo.',
      );
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.type('png').send(await readFile(resolve('assets/billing-qris.png')));
  }
  @Post('payments/:id/proof') submit(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: SubmitProofDto,
  ) {
    return this.billing.submit(user, id, dto.content);
  }
  @Post('payments/:id/retry-email') retry(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.billing.retry(user, id);
  }
  @Post('payments/:id/cancel') cancelPayment(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.billing.cancel(user, id);
  }
}
