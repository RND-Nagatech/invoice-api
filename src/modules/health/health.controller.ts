import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthResult, HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Current API and dependency status' })
  check(): Promise<HealthResult> {
    return this.health.check();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  async ready(): Promise<HealthResult> {
    const result = await this.health.check();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException('Layanan belum siap.');
    }
    return result;
  }
}
