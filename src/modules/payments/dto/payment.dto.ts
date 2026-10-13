import {
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Min,
  Max,
} from 'class-validator';
export class CreatePaymentDto {
  @IsMongoId() invoiceId!: string;
  @IsOptional() @IsIn(['MANUAL']) provider = 'MANUAL' as const;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000_000) amount?: number;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  idempotencyKey?: string;
}

export class PaymentQueryDto {
  @IsOptional() @IsMongoId() invoiceId?: string;
}
export class PaymentWebhookDto {
  @IsString() @MaxLength(120) providerReference!: string;
  @IsString() @IsIn(['PAID', 'FAILED', 'EXPIRED']) status!:
    'PAID' | 'FAILED' | 'EXPIRED';
  @IsOptional() @IsString() @MaxLength(120) eventId?: string;
}

export class PublicPaymentProofDto {
  @IsInt() @Min(1) @Max(1_000_000_000) amount!: number;
  @IsString() @MaxLength(2800000) proofBase64!: string;
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-zA-Z0-9_-]{8,80}$/)
  requestId!: string;
  @IsOptional() @IsString() @MaxLength(120) senderName?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RejectPaymentDto {
  @IsString() @MaxLength(500) reason!: string;
}
