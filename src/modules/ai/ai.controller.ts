import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AiService } from './ai.service.js';
import { TextInvoiceDraftDto, VoiceInvoiceDto } from './dto/ai.dto.js';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}
  @Get('usage') usage(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.ai.usage(user);
  }
  @Post('invoice-draft') text(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: TextInvoiceDraftDto,
  ) {
    return this.ai.text(user, dto);
  }
  @Post('voice-invoice') voice(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: VoiceInvoiceDto,
  ) {
    return this.ai.voice(user, dto);
  }
}
