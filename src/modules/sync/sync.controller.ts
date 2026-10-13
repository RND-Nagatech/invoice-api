import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { PushSyncDto } from './dto/sync.dto.js';
import { SyncService } from './sync.service.js';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push') push(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: PushSyncDto,
  ) {
    return this.sync.push(user, dto);
  }

  @Get('queue') queue(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.sync.queue(user);
  }
}
