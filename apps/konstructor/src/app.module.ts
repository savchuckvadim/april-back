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
// Справочник шаблонов отчёта о поставке (CRUD для админки). Подбор шаблона
// при генерации живёт в общем резолвере document-template, здесь — только
// ведение справочника; строка шаблона в этом домене опциональна.
import { SupplyReportTemplateModule } from './modules/supply-report-template';
// Слои доставки konstructor-роутов: контроллеры вынесены из сервисных
// модулей, чтобы не утекать в Swagger других приложений
// (ai/rules/app-api-surface.md), поэтому подключаются здесь явно.
import { ProviderPublicModule } from '@lib/portal-lib/konstructor/provider';
import { TemplateBasePublicModule } from '@lib/portal-lib/konstructor/template-base';
// Счётчики номеров документов (document-counter/next|peek|current и admin):
// тот же модуль, что в pbx-install. Легаси-фронт берёт здесь номер счёта
// (next/:rqId/invoice), который старая сборка back.april-app.ru отдавала сама.
// Из зависимостей модулю нужен только Prisma — он @Global.
import { DocumentCounterModule } from '@lib/portal-lib/konstructor';
// CRUD шаблонов договора (contract-templates/*). Подключается здесь, а не
// в KonstructorModule: контроллер нужен только konstructor-приложению, и
// так его роуты не утекают в Swagger остальных приложений
// (ai/rules/app-api-surface.md).
import { ContractTemplateModule } from './modules/contract-template';
// Отдел продаж портала (bitrix/department/sales): легаси-конструктор уже
// зовёт его на этом хосте, а админке он нужен для выбора пользователя,
// от лица которого настраиваются шаблоны КП.
import { BxDepartmentModule } from '@lib/bx-department/bx-department.module';
// Read-only роуты «какой шаблон будет выбран и почему» + диагностика
// неоднозначности (konstructor/templates/resolve/*, /diagnostics/ambiguous).
// Только контроллер: сам резолвер живёт в DocumentTemplateModule, который
// подключается сервисно там, где нужен подбор при генерации. Раскол —
// по ai/rules/app-api-surface.md, иначе эти роуты утекут в Swagger
// приложений, тянущих konstructor транзитом.
import { DocumentTemplatePublicModule } from '@lib/portal-lib/konstructor/document-template';

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
        SupplyReportTemplateModule,
        ProviderPublicModule,
        TemplateBasePublicModule,
        DocumentCounterModule,
        ContractTemplateModule,
        BxDepartmentModule,
        DocumentTemplatePublicModule,
    ],
    providers: [GlobalExceptionFilter],
})
export class KonstructorAppModule {}
