import { Module } from '@nestjs/common';
import { VendorSettingsModule } from '@lib/portal-lib/store/vendor-settings/vendor-settings.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CronJobsReportModule } from '@lib/core/schedule';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { EventModule } from './event.module';
import { BxDepartmentModule } from 'libs/bx-department';
import { AiRagModule } from '@lib/ai-rag';
import {
    TranscriptionModule,
    CallAnalysisModule,
    AiModule,
} from '@lib/call-lib';
import { CallReportModule } from './call-report/call-report.module';
import { AgentGateModule } from './agent-gate/agent-gate.module';
import { PortalSessionApiModule } from '@lib/auth';
import { BitrixProxyModule } from './bitrix-proxy/bitrix-proxy.module';
import { FrameProxyModule } from './bitrix-proxy/frame/frame-proxy.module';
import { MergeDealsModule } from './merge-deals/merge-deals.module';
import { DuplicatesModule } from './duplicates/duplicates.module';
import { AppCacheServiceModule } from '@lib/app-cache';
import { EventSalesAppSettingsModule } from './app-settings/app-settings.module';
import { EventSalesQuestionnairesModule } from './questionnaires/questionnaires.module';
import { EventSalesBadgesModule } from './badges/badges.module';
import { DealAuditModule } from './deal-audit/deal-audit.module';
import { DuplicateReportModule } from './duplicate-report/duplicate-report.module';
import { InnModule } from './inn/inn.module';
import { ClientTypeModule } from './client-type/client-type.module';
import { DealOwnerModule } from './deal-owner/deal-owner.module';

@Module({
    imports: [
        // Настройки вендора из админки (прокси за рубеж, ключи AI) для библиотек этого приложения.
        VendorSettingsModule,
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/event-sales/.env', '.env'],
        }),
        LoggerModule.forRoot({ appName: 'event-sales' }),
        MetricsModule.forRoot({ appName: 'event-sales' }),
        EventEmitterModule.forRoot(),
        // Крон автоконвейера AI-отчётности (CallReportScheduler)
        ScheduleModule.forRoot(),
        // При старте — список кронов с ближайшими запусками в Telegram
        CronJobsReportModule,
        HealthModule,
        EventModule,

        //from shared
        BxDepartmentModule,
        AiRagModule,

        // звонки: транскрибация + AI-анализ (перенесено из apps/back)
        TranscriptionModule,
        CallAnalysisModule,
        AiModule,

        // AI-отчётность по звонкам: конвейер + Agent API для внешнего агента
        CallReportModule,
        AgentGateModule,
        // Agent API: прокси произвольных методов Bitrix (те же ключи агентов)
        BitrixProxyModule,
        // Сессия фрейма (POST auth/portal-session) и работа «Звонков» через
        // сервер, когда у сотрудника не хватает прав на портале.
        PortalSessionApiModule,
        FrameProxyModule,
        // Объединение сделок: пока заглушка — маршруты и Swagger без логики
        MergeDealsModule,
        // Центральный кэш: сервисный модуль без контроллера, чтобы роуты
        // /app-cache не утекли в Swagger приложения (по нему генерится клиент).
        AppCacheServiceModule,
        // Поиск дублей клиента для фрейма отдела продаж
        DuplicatesModule,
        // Вкладка «ИНН» карточки сделки: снимок, выбор плательщика,
        // скрытие лишних вариантов. Единственный писатель op_inn —
        // библиотека @lib/portal-lib/pbx-inn.
        InnModule,
        // Тип клиента в шапке: один на сделку и компанию, как ИНН.
        ClientTypeModule,
        // Компания и контакты за ответственным своей сделки (22.10.2026).
        DealOwnerModule,
        // Чтение настроек приложений фронтами (замена хардкода domain-config)
        EventSalesAppSettingsModule,
        // Портальный каталог анкет плана/отчёта — читается фреймом на старте
        EventSalesQuestionnairesModule,
        // Бейджики комментария и названия события: общий набор или свой
        // набор портала из админки — читается фреймом на старте (27.10.2026).
        EventSalesBadgesModule,
        // Аудит сделок: крон ищет «забытые» сделки и размечает их полями
        // op_audit_*. По умолчанию выключен на всех порталах.
        DealAuditModule,
        // Отчёт по дублям сделок: раз в неделю руководителям задача с
        // Excel по клиентам с несколькими открытыми сделками. Выключен.
        DuplicateReportModule,
    ],
    providers: [GlobalExceptionFilter],
    exports: [BxDepartmentModule, AiRagModule],
})
export class EventSalesModule {}
