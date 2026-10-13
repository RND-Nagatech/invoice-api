import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString({ message: 'Refresh token wajib diisi.' })
  @MinLength(10, { message: 'Refresh token tidak valid.' })
  refreshToken!: string;
}
