import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalOnlineCacheService } from './portal-online-cache.service';

/**
 * Лёгкий модуль сброса online-кэша слепка портала: только Redis, без
 * остального стора (ключи/крипта/outer). Нужен приложениям, которым от
 * portal-store требуется единственное — инвалидация `portal_{domain}`.
 */
@Module({
    imports: [RedisModule],
    providers: [PortalOnlineCacheService],
    exports: [PortalOnlineCacheService],
})
export class PortalOnlineCacheModule {}
