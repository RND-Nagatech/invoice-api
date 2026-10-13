import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Redis } from 'ioredis';
import type { Connection } from 'mongoose';

export interface HealthResult {
  status: 'ok' | 'degraded';
  mongodb: 'ok' | 'down';
  redis: 'ok' | 'down';
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    @InjectConnection() private readonly mongo: Connection,
    config: ConfigService,
  ) {
    this.redis = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      lazyConnect: true,
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 1000, 5000),
    });
    this.redis.on('error', () => undefined);
  }

  async check(): Promise<HealthResult> {
    const mongodb = this.mongo.readyState === 1 ? 'ok' : 'down';
    let redis: 'ok' | 'down' = 'down';
    try {
      if (this.redis.status === 'wait' || this.redis.status === 'end') {
        await this.redis.connect();
      }
      redis = (await this.redis.ping()) === 'PONG' ? 'ok' : 'down';
    } catch {
      redis = 'down';
    }
    return {
      status: mongodb === 'ok' && redis === 'ok' ? 'ok' : 'degraded',
      mongodb,
      redis,
    };
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }
}
