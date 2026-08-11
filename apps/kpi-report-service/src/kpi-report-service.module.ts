import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { GlobalExceptionFilter, HealthModule } from '@lib/core';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { TelegramModule } from '@lib/telegram/telegram.module';

import { KpiReportOrkModule } from './kpi-report-ork.module';
import { SkapPortalModule } from './skap/skap-portal.module';

/**
 * Корневой модуль приложения kpi-report-service (KPI-отчёты ОРК).
 *
 * Самодостаточное приложение монорепозитория: поднимает только ту
 * инфраструктуру, которая нужна доменному модулю KpiReportOrkModule
 * (Config, Schedule, EventEmitter, Prisma — @Global, Telegram для уведомлений
 * глобального фильтра ошибок).
 *
 * Свой .env (apps/kpi-report-service/.env) расширяет/переопределяет корневой
 * .env: значения из app-окружения имеют приоритет (загружается первым
 * в envFilePath).
 */
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/kpi-report-service/.env', '.env'],
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
        LoggerModule.forRoot({ appName: 'kpi-report-service' }),
        MetricsModule.forRoot({ appName: 'kpi-report-service' }),
        ScheduleModule.forRoot(),
        EventEmitterModule.forRoot(),
        PrismaModule,
        TelegramModule,
        HealthModule,
        KpiReportOrkModule,
        SkapPortalModule,
    ],
    providers: [GlobalExceptionFilter],
})
export class KpiReportServiceModule {}
