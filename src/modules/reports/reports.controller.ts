import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { ReportQueryDto } from './dto/report.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('revenue') revenue(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ReportQueryDto,
  ) {
    return this.reports.revenue(user, query);
  }
  @Get('invoices') invoices(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ReportQueryDto,
  ) {
    return this.reports.invoices(user, query);
  }
  @Get('outstanding') outstanding(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.reports.outstanding(user);
  }
  @Get('customers') customers(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.reports.customers(user);
  }
}
