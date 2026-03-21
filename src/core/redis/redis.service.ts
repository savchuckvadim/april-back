// src/core/redis/redis.service.ts
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { createRedisOptions } from './redis.config';

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private client: Redis;

    constructor(private readonly configService: ConfigService) {
        this.logger.log('Создание Redis клиента...');

        const {
            url: redisUrl,
            host,
            port,
            connectTimeout,
            maxRetriesPerRequest,
        } = createRedisOptions(this.configService);
        this.logger.log(`Получены настройки Redis из конфига:`);
        this.logger.log(`REDIS_HOST: ${host}`);
        this.logger.log(`REDIS_PORT: ${port}`);
        this.logger.log(`process.env.REDIS_HOST: ${process.env.REDIS_HOST}`);
        this.logger.log(`process.env.REDIS_PORT: ${process.env.REDIS_PORT}`);

        if (redisUrl) {
            this.logger.log(`Используем REDIS_URL`);

            this.client = new Redis(redisUrl, {
                retryStrategy: times => {
                    const delay = Math.min(times * 50, 2000);
                    this.logger.log(`Повторная попытка через ${delay}ms`);
                    return delay;
                },
                maxRetriesPerRequest,
                connectTimeout,
            });
        } else {
            this.client = new Redis({
                host,
                port,
                retryStrategy: times => {
                    const delay = Math.min(times * 50, 2000);
                    this.logger.log(
                        `Повторная попытка подключения к Redis через ${delay}ms...`,
                    );
                    return delay;
                },
                maxRetriesPerRequest,
                connectTimeout,
            });
        }
        this.client.on('connect', () => {
            this.logger.log('Redis подключён ✅');
        });

        this.client.on('error', err => {
            this.logger.error('Redis ошибка ❌: ' + err.message);
        });

        this.client.on('end', () => {
            this.logger.warn('Redis отключён 🛑');
        });
    }

    getClient(): Redis {
        this.logger.debug('Redis клиент запрошен через getClient()');
        return this.client;
    }

    async onModuleDestroy() {
        this.logger.warn('Redis клиент закрывается через onModuleDestroy...');
        await this.client.quit();
    }
}
