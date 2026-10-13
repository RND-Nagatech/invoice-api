import {
  IsBase64,
  IsEmail,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
export class CheckoutSubscriptionDto {
  @IsIn(['PRO']) planId!: 'PRO';
}
export class SubmitProofDto {
  @IsString() @IsBase64() @MaxLength(6990508) content!: string;
}
export class BillingLoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) @MaxLength(200) password!: string;
}
export class ReviewPaymentDto {
  @IsIn(['approve', 'reject']) decision!: 'approve' | 'reject';
  @IsString() @MaxLength(500) reason!: string;
  @IsString() @MaxLength(300) csrf!: string;
}
