import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter.js';
import { ApiResponseInterceptor } from '../../common/interceptors/api-response.interceptor.js';
import { HealthController } from './health.controller.js';
import { HealthResult, HealthService } from './health.service.js';

describe('health API', () => {
  let app: INestApplication;
  let result: HealthResult;

  beforeAll(async () => {
    result = { status: 'ok', mongodb: 'ok', redis: 'ok' };
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: { check: async () => result } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns the actual dependency status in the API envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(response.body).toEqual({
      success: true,
      data: result,
      message: 'Success',
    });
  });

  it('rejects readiness when a dependency is down', async () => {
    result = { status: 'degraded', mongodb: 'ok', redis: 'down' };
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
