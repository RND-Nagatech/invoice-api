import { SetMetadata } from '@nestjs/common';

export const SkipApiResponse = () => SetMetadata('skipApiResponse', true);
