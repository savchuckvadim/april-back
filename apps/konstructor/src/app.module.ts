import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { GlobalExceptionFilter, HealthModule } from '@lib/core';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { TelegramModule } from '@lib/telegram/telegram.module';

import { KonstructorModule } from './konstructor.module';
import { OfferWordModule } from './offer-word/offer-word.module';
import { DocumentSupplyReportModule } from './document-supply-report/document-supply-report.module';
// Слои доставки konstructor-роутов: контроллеры вынесены из сервисных
// модулей, чтобы не утекать в Swagger других приложений
// (ai/rules/app-api-surface.md), поэтому подключаются здесь явно.
import { ProviderPublicModule } from '@lib/portal-lib/konstructor/provider';
import { TemplateBasePublicModule } from '@lib/portal-lib/konstructor/template-base';

/**
 * Корневой модуль приложения konstructor (конструктор документов).
 *
 * Самодостаточное приложение монорепозитория: поднимает инфраструктуру
 * (Config, Prisma — @Global, Telegram для уведомлений глобального фильтра
 * ошибок) и доменные модули конструктора: KonstructorModule (договоры,
 * КП, закупки, поставки), OfferWordModule (генерация word/pdf) и
 * DocumentSupplyReportModule (отчёты по поставкам).
 *
 * Свой .env (apps/konstructor/.env) расширяет/переопределяет корневой .env:
 * значения из app-окружения имеют приоритет (загружается первым в envFilePath).
 */
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/konstructor/.env', '.env'],
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
        LoggerModule.forRoot({ appName: 'konstructor' }),
        MetricsModule.forRoot({ appName: 'konstructor' }),
        PrismaModule,
        TelegramModule,
        HealthModule,
        KonstructorModule,
        OfferWordModule,
        DocumentSupplyReportModule,
        ProviderPublicModule,
        TemplateBasePublicModule,
    ],
    providers: [GlobalExceptionFilter],
})
export class KonstructorAppModule {}
