import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateReceiptDto {
  @IsMongoId() invoiceId!: string;
  @IsInt() @Min(1) @Max(1_000_000_000_000) amount!: number;
  @IsDateString() issuedAt!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  paymentMethod?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) notes?: string;
}
export class ReceiptQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) search?: string;
}
