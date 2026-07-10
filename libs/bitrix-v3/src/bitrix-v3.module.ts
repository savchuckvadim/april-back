import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@lib/core/redis/redis.module';
import { RedisService } from '@lib/core/redis/redis.service';
import { BitrixRateLimiterService } from '@lib/bitrix/core/rate-limit/bitrix-rate-limiter.service';
import { BitrixV3ServiceFactory } from './bitrix-v3-service.factory';

/**
 * Модуль клиента REST API 3.0.
 * Наружу отдаёт только фабрику — инстансы BitrixV3Service
 * создаются по credentials портала в момент запроса.
 */
@Module({
    imports: [ConfigModule, RedisModule],
    providers: [RedisService, BitrixRateLimiterService, BitrixV3ServiceFactory],
    exports: [BitrixV3ServiceFactory],
})
export class BitrixV3Module {}
