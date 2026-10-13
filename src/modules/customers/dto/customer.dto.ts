import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCustomerDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsIn(['PERSON', 'COMPANY'])
  type!: 'PERSON' | 'COMPANY';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  companyName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== '')
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  npwp?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class CustomerQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['PERSON', 'COMPANY'])
  type?: 'PERSON' | 'COMPANY';

  @IsOptional()
  @IsIn(['CREATED_DESC', 'CREATED_ASC'])
  sort?: 'CREATED_DESC' | 'CREATED_ASC';

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
