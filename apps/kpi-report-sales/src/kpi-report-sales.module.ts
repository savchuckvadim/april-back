import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { GlobalExceptionFilter, HealthModule } from '@/core';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { TelegramModule } from '@lib/telegram/telegram.module';
import { BxDepartmentModule } from '@lib/bx-department';

import { KpiReportModule } from './kpi-report.module';
import { ReportSettingsModule } from './report-settings/report-settings.module';

/**
 * Корневой модуль приложения kpi-report-sales.
 *
 * Самодостаточное приложение монорепозитория: поднимает только ту
 * инфраструктуру, которая нужна доменному модулю KpiReportModule
 * (Config, Schedule, EventEmitter, Prisma — @Global, Telegram для уведомлений
 * глобального фильтра ошибок).
 *
 * BxDepartmentModule подключён, чтобы эндпоинты отделов/команд Bitrix
 * были доступны и из этого приложения (как в event-sales).
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
        HealthModule,
        PrismaModule,
        TelegramModule,
        KpiReportModule,
        ReportSettingsModule,

        // from shared: эндпоинты отделов/команд Bitrix наружу
        BxDepartmentModule,
    ],
    providers: [GlobalExceptionFilter],
})
export class KpiReportSalesModule {}
