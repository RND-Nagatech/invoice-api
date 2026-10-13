import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { CreateReceiptDto, ReceiptQueryDto } from './dto/receipt.dto.js';
import { ReceiptsService } from './receipts.service.js';

@ApiTags('receipts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ReceiptQueryDto,
  ) {
    return this.receipts.list(user, query);
  }
  @Get(':id') get(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.receipts.get(user, id);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateReceiptDto,
  ) {
    return this.receipts.create(user, dto);
  }
}
