import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { RedisModule } from '@/core/redis/redis.module';
import { PbxCacheModule } from './pbx-cache/pbx-cache.module';

/**
 * Корневой модуль приложения pbx.
 *
 * Назначение: единый кэш общих для разных приложений данных портала
 * (Portal, Providers, Contracts, Favorites, Templates, Cache, Departments,
 * UserFilters). Данные хранятся в Redis и переживают перезапуск/удаление
 * контейнера за счёт volume + AOF-персистентности (см. infra/compose).
 *
 * Архитектура: app зависит только от общих библиотек (libs/*) и собственного
 * feature-модуля PbxCacheModule. Доступ к Redis — через RedisService из @/core.
 */
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/pbx/.env', '.env'],
            ignoreEnvFile: false,
        }),
        HealthModule,
        RedisModule,
        PbxCacheModule,
    ],
    providers: [GlobalExceptionFilter],
})
export class AppModule {}
