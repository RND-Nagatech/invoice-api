import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReminderDto {
  @IsMongoId() invoiceId!: string;
  @IsDateString() remindAt!: string;
  @IsOptional() @IsIn(['EMAIL']) channel = 'EMAIL' as const;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}
export class ReminderQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}
