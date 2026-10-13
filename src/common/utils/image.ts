import { BadRequestException } from '@nestjs/common';

export function decodeImage(content: string, maxBytes = 5 * 1024 * 1024) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content))
    throw new BadRequestException('Format gambar tidak valid.');
  const buffer = Buffer.from(content, 'base64');
  if (buffer.length < 16 || buffer.length > maxBytes)
    throw new BadRequestException('Ukuran gambar tidak valid.');
  const png = buffer
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (!png && !jpeg)
    throw new BadRequestException('Gambar harus berupa JPG atau PNG.');
  return { buffer, mime: png ? 'image/png' : 'image/jpeg' };
}

export function decodeLogo(value: string) {
  const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(value);
  if (!match)
    throw new BadRequestException(
      'Unggah logo berupa JPG/PNG maksimal 512 KB.',
    );
  const image = decodeImage(match[2], 512 * 1024);
  if (image.mime !== match[1])
    throw new BadRequestException('Format logo tidak sesuai.');
  return image;
}
