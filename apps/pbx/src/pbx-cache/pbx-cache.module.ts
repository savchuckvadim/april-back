import { Module } from '@nestjs/common';
import { RedisModule } from '@/core/redis/redis.module';
import { PbxCacheController } from './pbx-cache.controller';
import { PbxCacheService } from './pbx-cache.service';

/**
 * Feature-модуль кэша общих данных портала (Portal, Providers, Contracts,
 * Favorites, Templates, Cache, Departments, UserFilters).
 */
@Module({
    imports: [RedisModule],
    controllers: [PbxCacheController],
    providers: [PbxCacheService],
    exports: [PbxCacheService],
})
export class PbxCacheModule {}
