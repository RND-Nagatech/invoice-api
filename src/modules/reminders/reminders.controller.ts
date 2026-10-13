import {
  Body,
  Controller,
  Get,
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
import { CreateReminderDto, ReminderQueryDto } from './dto/reminder.dto.js';
import { RemindersService } from './reminders.service.js';

@ApiTags('reminders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ReminderQueryDto,
  ) {
    return this.reminders.list(user, query);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateReminderDto,
  ) {
    return this.reminders.create(user, dto);
  }
  @Patch(':id/cancelled') cancelled(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.reminders.mark(user, id, 'CANCELLED');
  }
}
