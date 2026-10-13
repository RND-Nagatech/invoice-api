import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { TemplateMarketplaceService } from './template-marketplace.service.js';
import { TemplatesService } from './templates.service.js';

@ApiTags('templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplatesController {
  constructor(
    private readonly templates: TemplatesService,
    private readonly marketplace: TemplateMarketplaceService,
  ) {}

  @Get()
  list(
    @Query('category') category?: string,
    @Query('profession') profession?: string,
  ) {
    return { items: this.marketplace.marketplace(category, profession) };
  }

  @Get('categories') categories() {
    return { items: this.templates.categories() };
  }
  @Get('professions') professions() {
    return { items: this.templates.professions() };
  }
  @Get('purchases') purchases(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.marketplace.owned(user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.templates.get(id);
  }

  @Post(':id/purchase') purchase(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.marketplace.purchase(user, id);
  }
}
