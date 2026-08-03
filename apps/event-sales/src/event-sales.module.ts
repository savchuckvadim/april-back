import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { BitrixProxyModule } from './bitrix-proxy/bitrix-proxy.module';
import { MergeDealsModule } from './merge-deals/merge-deals.module';
import { DuplicatesModule } from './duplicates/duplicates.module';
import { AppCacheServiceModule } from '@lib/app-cache';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/event-sales/.env', '.env'],
        }),
        LoggerModule.forRoot({ appName: 'event-sales' }),
        MetricsModule.forRoot({ appName: 'event-sales' }),
        EventEmitterModule.forRoot(),
        // Крон автоконвейера AI-отчётности (CallReportScheduler)
        ScheduleModule.forRoot(),
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
        // Объединение сделок: пока заглушка — маршруты и Swagger без логики
        MergeDealsModule,
        // Центральный кэш: сервисный модуль без контроллера, чтобы роуты
        // /app-cache не утекли в Swagger приложения (по нему генерится клиент).
        AppCacheServiceModule,
        // Поиск дублей клиента для фрейма отдела продаж
        DuplicatesModule,
    ],
    providers: [GlobalExceptionFilter],
    exports: [BxDepartmentModule, AiRagModule],
})
export class EventSalesModule {}
