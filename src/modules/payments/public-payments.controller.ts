import { Body, Controller, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicPaymentProofDto } from './dto/payment.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('public/invoices')
export class PublicPaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Post(':publicId/payment-proof')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  submit(
    @Param('publicId') publicId: string,
    @Body() dto: PublicPaymentProofDto,
  ) {
    return this.payments.submitPublicProof(publicId, dto);
  }
}
