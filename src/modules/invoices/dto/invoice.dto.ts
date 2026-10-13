import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class InvoiceItemDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(10000)
  quantity!: number;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  unit?: string;
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  unitPrice!: number;
}

export class CreateInvoiceDto {
  @IsMongoId() customerId!: string;
  @IsDateString() issueDate!: string;
  @IsDateString() dueDate!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  discount?: number;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxPercent?: number;
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  additionalFee?: number;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  templateId?: string;
  @IsOptional()
  @IsBoolean()
  showPageNumber?: boolean;
}

export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {}

export class PartialPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1_000_000_000)
  amount!: number;
}

export class InvoiceFollowUpQueryDto {
  @IsOptional() @IsIn(['id', 'en']) language: 'id' | 'en' = 'id';
}

export class InvoiceQueryDto {
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  search?: string;
  @IsOptional()
  @IsIn([
    'ALL',
    'DRAFT',
    'SENT',
    'VIEWED',
    'PARTIALLY_PAID',
    'PAID',
    'UNPAID',
    'OVERDUE',
    'CANCELLED',
    'VOID',
  ])
  status?:
    | 'ALL'
    | 'DRAFT'
    | 'SENT'
    | 'VIEWED'
    | 'PARTIALLY_PAID'
    | 'PAID'
    | 'UNPAID'
    | 'OVERDUE'
    | 'CANCELLED'
    | 'VOID';

  @IsOptional()
  @IsIn(['DATE_DESC', 'DATE_ASC', 'TOTAL_DESC', 'TOTAL_ASC'])
  sort?: 'DATE_DESC' | 'DATE_ASC' | 'TOTAL_DESC' | 'TOTAL_ASC';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
