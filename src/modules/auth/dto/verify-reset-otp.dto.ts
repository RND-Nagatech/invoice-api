import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class VerifyResetOtpDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Format email tidak valid.' })
  email!: string;

  @IsString({ message: 'Kode OTP wajib diisi.' })
  @Length(6, 6, { message: 'Kode OTP harus terdiri dari 6 angka.' })
  @Matches(/^\d{6}$/, { message: 'Kode OTP harus terdiri dari 6 angka.' })
  otp!: string;
}
