import { Transform } from 'class-transformer';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Format email tidak valid.' })
  email!: string;

  @IsString({ message: 'Password wajib diisi.' })
  password!: string;
}
