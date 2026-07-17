import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { GlobalExceptionFilter, HealthModule } from '@/core';

/**
 * Корневой модуль legacy-приложения back.
 *
 * Монолит полностью разобран на apps/* и libs/* (см. docs/MONOREPO.md).
 * Приложение оставлено пустым: отдаёт только GET /api/health —
 * контракт для docker healthcheck и prometheus, пока внешние
 * потребители не переключены на новые сервисы.
 */
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/back/.env', '.env'],
        }),
        LoggerModule.forRoot({ appName: 'back' }),
        MetricsModule.forRoot({ appName: 'back' }),
        HealthModule,
    ],
    providers: [GlobalExceptionFilter],
})
export class AppModule {}
