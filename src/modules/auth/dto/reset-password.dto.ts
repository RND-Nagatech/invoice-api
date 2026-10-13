import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString({ message: 'Token reset wajib diisi.' })
  @MinLength(20, { message: 'Token reset tidak valid.' })
  @MaxLength(256, { message: 'Token reset tidak valid.' })
  resetToken!: string;

  @IsString({ message: 'Password wajib diisi.' })
  @MinLength(8, { message: 'Password minimal 8 karakter.' })
  @MaxLength(128, { message: 'Password maksimal 128 karakter.' })
  @Matches(/[a-z]/, { message: 'Password harus memiliki huruf kecil.' })
  @Matches(/[A-Z]/, { message: 'Password harus memiliki huruf besar.' })
  @Matches(/\d/, { message: 'Password harus memiliki angka.' })
  newPassword!: string;
}
