import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class ReportQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(['daily', 'weekly', 'monthly']) period:
    'daily' | 'weekly' | 'monthly' = 'monthly';
}
