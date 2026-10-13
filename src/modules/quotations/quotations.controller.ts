import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import {
  CreateQuotationDto,
  QuotationQueryDto,
  UpdateQuotationDto,
} from './dto/quotation.dto.js';
import { QuotationsService } from './quotations.service.js';

@ApiTags('quotations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: QuotationQueryDto,
  ) {
    return this.quotations.list(user, query);
  }
  @Get(':id') get(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.quotations.get(user, id);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateQuotationDto,
  ) {
    return this.quotations.create(user, dto);
  }
  @Patch(':id') update(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateQuotationDto,
  ) {
    return this.quotations.update(user, id, dto);
  }
  @Delete(':id') @HttpCode(200) delete(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.quotations.delete(user, id);
  }
  @Post(':id/send') @HttpCode(200) send(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.quotations.transition(user, id, 'DRAFT', 'SENT');
  }
  @Post(':id/accept') @HttpCode(200) accept(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.quotations.transition(user, id, 'SENT', 'ACCEPTED');
  }
  @Post(':id/reject') @HttpCode(200) reject(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.quotations.transition(user, id, 'SENT', 'REJECTED');
  }
  @Post(':id/convert-to-invoice') @HttpCode(200) convert(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.quotations.convert(user, id);
  }
}
