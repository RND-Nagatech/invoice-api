import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Nama wajib diisi.' })
  @MinLength(2, { message: 'Nama minimal 2 karakter.' })
  @MaxLength(80, { message: 'Nama maksimal 80 karakter.' })
  name!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Nama bisnis wajib diisi.' })
  @MinLength(2, { message: 'Nama bisnis minimal 2 karakter.' })
  @MaxLength(120, { message: 'Nama bisnis maksimal 120 karakter.' })
  businessName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Format email tidak valid.' })
  @MaxLength(254, { message: 'Email terlalu panjang.' })
  email!: string;

  @IsString({ message: 'Password wajib diisi.' })
  @MinLength(8, { message: 'Password minimal 8 karakter.' })
  @MaxLength(128, { message: 'Password maksimal 128 karakter.' })
  password!: string;
}
