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
import { AppCacheModule } from '@lib/app-cache';

import { ReportModule } from './report';
import { DownloadModule } from './download';
import { AirtimeModule } from './airtime';
import { UserReportModule } from './user-report';
import { ReportSettingsModule } from './report-settings';
import { SalesFinanceModule } from './sales-finance';
import { ShareLinkModule } from './share-link';

/**
 * Корневой модуль приложения kpi-report-sales.
 *
 * Самодостаточное приложение монорепозитория: поднимает только ту
 * инфраструктуру, которая нужна доменным модулям (Config, Schedule,
 * EventEmitter, Prisma — @Global, Telegram для уведомлений глобального
 * фильтра ошибок), и подключает feature-модули — по одному на тег Swagger:
 *
 *   ReportModule         → «Sales Report»
 *   DownloadModule       → «KPI Sales Report Download»
 *   AirtimeModule        → «Sales Airtime»
 *   UserReportModule     → «Sales Report» (ручка sales-user-report)
 *   ReportSettingsModule → «Report Settings» / «UI Settings»
 *   SalesFinanceModule   → «Sales Finance»
 *
 * BxDepartmentModule подключён, чтобы эндпоинты отделов/команд Bitrix
 * были доступны и из этого приложения (как в event-sales).
 *
 * ВАЖНО про Swagger-изоляцию: сюда НЕЛЬЗЯ импортировать сервисные модули
 * ради их провайдеров (Token/Secret/PortalStore/BitrixSetupInstall и т.п.) —
 * вместе с провайдерами Nest затянет их controllers, и чужие роуты утекут
 * в Swagger этого приложения. Нужен сервис из такого модуля — импортируй
 * только его *ServiceModule без контроллеров.
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

        // Feature-модули (по тегу Swagger)
        ReportModule,
        DownloadModule,
        AirtimeModule,
        UserReportModule,
        ReportSettingsModule,
        SalesFinanceModule,
        ShareLinkModule,

        // from shared: эндпоинты отделов/команд Bitrix наружу
        BxDepartmentModule,

        // Центральный кэш (Redis + app_cache): сервис глобально + инспекция
        AppCacheModule,
    ],
    providers: [GlobalExceptionFilter],
})
export class KpiReportSalesModule {}
