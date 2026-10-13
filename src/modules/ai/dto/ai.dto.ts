import {
  IsBase64,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';

export class TextInvoiceDraftDto {
  @IsString()
  @MinLength(3)
  @MaxLength(8000)
  text!: string;
}

export class VoiceInvoiceDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,100}$/)
  requestId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(8000)
  transcript?: string;
  @IsOptional()
  @IsBase64()
  @MaxLength(8_000_000)
  audioBase64?: string;
}
