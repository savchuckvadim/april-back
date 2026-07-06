import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { PrismaModule } from '@/core/prisma/prisma.module';
import { TelegramModule } from '@lib/telegram/telegram.module';
import { GlobalExceptionFilter } from '@/core/filters/global-exception.filter';

import { KpiReportModule } from './kpi-report.module';
import { HealthController } from './health.controller';

/**
 * Корневой модуль приложения kpi-report-sales.
 *
 * Самодостаточное приложение монорепозитория: поднимает только ту
 * инфраструктуру, которая нужна доменному модулю KpiReportModule
 * (Config, Schedule, EventEmitter, Prisma — @Global, Telegram для уведомлений
 * глобального фильтра ошибок).
 *
 * Свой .env (apps/kpi-report-sales/.env) расширяет/переопределяет корневой .env:
 * значения из app-окружения имеют приоритет (загружается первым в envFilePath).
 */
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/kpi-report-sales/.env', '.env'],
            ignoreEnvFile: false,
            load: [
                () => ({
                    REDIS_URL: process.env.REDIS_URL,
                    REDIS_HOST: process.env.REDIS_HOST,
                    REDIS_PORT: process.env.REDIS_PORT,
                    REDIS_USER: process.env.REDIS_USER,
                    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
                }),
            ],
        }),
        LoggerModule.forRoot({ appName: 'kpi-report-sales' }),
        MetricsModule.forRoot({ appName: 'kpi-report-sales' }),
        ScheduleModule.forRoot(),
        EventEmitterModule.forRoot(),
        PrismaModule,
        TelegramModule,
        KpiReportModule,
    ],
    controllers: [HealthController],
    providers: [GlobalExceptionFilter],
})
export class KpiReportSalesModule {}
