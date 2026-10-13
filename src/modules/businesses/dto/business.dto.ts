import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class BankAccountDto {
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  bankName!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(120)
  accountName!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(50)
  accountNumber!: string;
}

export class UpdateBusinessDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(700000)
  logo?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  address?: string;

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
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  npwp?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  qris?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BankAccountDto)
  bankAccounts?: BankAccountDto[];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  defaultTemplate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  defaultDueDate?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  defaultFooter?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(7)
  brandColor?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(7)
  secondaryColor?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  fontPreset?: string;
}
