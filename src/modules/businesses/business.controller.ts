import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UpdateBusinessDto } from './dto/business.dto.js';
import { BusinessService } from './business.service.js';

@ApiTags('business')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('business')
export class BusinessController {
  constructor(private readonly businesses: BusinessService) {}

  @Get() get(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.businesses.get(user);
  }

  @Patch() update(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.businesses.update(user, dto);
  }
}
