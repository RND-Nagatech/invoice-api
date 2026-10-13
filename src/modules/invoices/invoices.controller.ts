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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { SkipApiResponse } from '../../common/decorators/skip-api-response.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import {
  CreateInvoiceDto,
  InvoiceQueryDto,
  InvoiceFollowUpQueryDto,
  PartialPaymentDto,
  UpdateInvoiceDto,
} from './dto/invoice.dto.js';
import { InvoicesService } from './invoices.service.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import {
  ActivitySeenDto,
  ServiceRecordDto,
} from './dto/customer-experience.dto.js';

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly pdf: InvoicePdfService,
  ) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: InvoiceQueryDto,
  ) {
    return this.invoices.list(user, query);
  }
  @Get(':id/share-link') shareLink(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.invoices.shareLink(user, id);
  }
  @Get('customer-activity') customerActivity(
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.invoices.customerActivity(user);
  }
  @Post(':id/activity-seen') activitySeen(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: ActivitySeenDto,
  ) {
    return this.invoices.markActivitySeen(user, id, dto.seenAt);
  }
  @Get(':id/service-record') serviceRecord(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.invoices.serviceRecord(user, id);
  }
  @Post(':id/service-record') saveServiceRecord(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: ServiceRecordDto,
  ) {
    return this.invoices.saveServiceRecord(user, id, dto);
  }
  @Get(':id/follow-up') followUp(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Query() query: InvoiceFollowUpQueryDto,
  ) {
    return this.invoices.followUp(user, id, query.language);
  }
  @Get(':id/pdf')
  @SkipApiResponse()
  async pdfFile(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const data = await this.pdf.render(user.businessId, id);
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${id}.pdf"`,
      'Content-Length': data.length.toString(),
    });
    response.end(data);
  }
  @Get(':id') get(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.invoices.get(user, id);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoices.create(user, dto);
  }
  @Patch(':id') update(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoices.update(user, id, dto);
  }
  @Delete(':id') @HttpCode(200) delete(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.invoices.delete(user, id);
  }
  @Post(':id/mark-paid') @HttpCode(200) markPaid(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.invoices.markPaid(user, id);
  }
  @Post(':id/send') @HttpCode(200) send(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.invoices.send(user, id);
  }
  @Post(':id/partial-paid') @HttpCode(200) partialPaid(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: PartialPaymentDto,
  ) {
    return this.invoices.partialPaid(user, id, dto);
  }
  @Post(':id/void') @HttpCode(200) voidInvoice(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.invoices.void(user, id);
  }
  @Post(':id/cancel') @HttpCode(200) cancel(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.invoices.cancel(user, id);
  }
  @Post(':id/duplicate') @HttpCode(200) duplicate(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.invoices.duplicate(user, id);
  }
}
