import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class QuotationItemDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;
  @IsInt() @Min(1) @Max(10000) quantity!: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) unit?: string;
  @IsInt() @Min(0) @Max(1_000_000_000) unitPrice!: number;
}

export class CreateQuotationDto {
  @IsMongoId() customerId!: string;
  @IsDateString() issueDate!: string;
  @IsDateString() validUntil!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items!: QuotationItemDto[];
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000) discount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) taxPercent?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateQuotationDto {
  @IsOptional() @IsMongoId() customerId?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items?: QuotationItemDto[];
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000) discount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) taxPercent?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) notes?: string;
}
export class QuotationQueryDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) search?: string;
  @IsOptional()
  @IsIn(['ALL', 'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED'])
  status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
