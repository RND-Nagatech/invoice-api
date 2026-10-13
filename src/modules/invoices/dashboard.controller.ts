import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { DashboardQueryDto } from './dto/dashboard.dto.js';
import { InvoicesService } from './invoices.service.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly invoices: InvoicesService) {}
  @Get('summary') summary(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: DashboardQueryDto,
  ) {
    return this.invoices.dashboard(user, query.period);
  }
}
