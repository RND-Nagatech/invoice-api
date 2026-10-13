import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsEventDto } from './dto/analytics-event.dto.js';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('events')
  @HttpCode(202)
  record(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: AnalyticsEventDto,
  ) {
    return this.analytics.record(user, dto);
  }
}
