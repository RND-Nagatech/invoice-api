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
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateItemDto, ItemQueryDto, UpdateItemDto } from './dto/item.dto.js';
import { ItemsService } from './items.service.js';

@ApiTags('items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get() list(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ItemQueryDto,
  ) {
    return this.items.list(user, query);
  }
  @Get(':id') get(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.items.get(user, id);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateItemDto,
  ) {
    return this.items.create(user, dto);
  }
  @Patch(':id') update(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.items.update(user, id, dto);
  }
  @Delete(':id') @HttpCode(200) delete(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.items.delete(user, id);
  }
}
