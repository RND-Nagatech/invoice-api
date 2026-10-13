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
import { CustomersService } from './customers.service.js';
import {
  CreateCustomerDto,
  CustomerQueryDto,
  UpdateCustomerDto,
} from './dto/customer.dto.js';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get() list(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: CustomerQueryDto,
  ) {
    return this.customers.list(user, query);
  }
  @Get(':id') get(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.customers.get(user, id);
  }
  @Get(':id/invoices') invoices(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Query() query: CustomerQueryDto,
  ) {
    return this.customers.invoicesForCustomer(user, id, query);
  }
  @Get(':id/summary') summary(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.customers.summary(user, id);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customers.create(user, dto);
  }
  @Patch(':id') update(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(user, id, dto);
  }
  @Delete(':id') @HttpCode(200) delete(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.customers.delete(user, id);
  }
}
