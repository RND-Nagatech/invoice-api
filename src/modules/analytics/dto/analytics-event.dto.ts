import {
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class AnalyticsEventDto {
  @IsString() @MaxLength(80) eventName!: string;
  @IsOptional() @IsObject() properties?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(120) sessionId?: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
}
