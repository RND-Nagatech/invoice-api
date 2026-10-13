import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateItemDto {
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

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  unit?: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  defaultPrice!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  tax?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateItemDto extends PartialType(CreateItemDto) {}

export class ItemQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  active?: boolean;

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
