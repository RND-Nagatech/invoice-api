import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class PaymentPromiseDto {
  @IsDateString() date!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RepeatOrderDto {
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
}

export class ActivitySeenDto {
  @IsDateString() seenAt!: string;
}

export class ServiceRecordDto {
  @IsOptional() @IsString() @MaxLength(120) serialNumber?: string;
  @IsOptional() @IsString() @MaxLength(1500) workSummary?: string;
  @IsOptional() @IsDateString() warrantyStartsAt?: string | null;
  @IsOptional() @IsDateString() warrantyUntil?: string | null;
  @IsOptional() @IsDateString() nextServiceAt?: string | null;
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(720000, { each: true })
  photos!: string[];
}
