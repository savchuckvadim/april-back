/**
 * Модуль среза «AI-резюме» (план Фазы 2, §1.6 п. 2: срез объявляет
 * собственный `@Module`, сборка приложения его импортирует — корневой
 * модуль фичи не растёт и потоки не конфликтуют).
 *
 * Содержит ручку `POST /ai-analytics/brief`, два use-case'а (конверт
 * ручки и выполнение джобы), порт модели с адаптером на VibeCode,
 * дневную квоту вызовов и сборщик пакета фактов.
 *
 * Поверхность API: VibecodeModule тянет ConfigModule и PortalStoreModule
 * — оба СЕРВИСНЫЕ, без контроллеров (роуты портала живут в
 * PortalStoreAdminModule и подключаются только в apps/admin, см.
 * ai/rules/app-api-surface.md), поэтому импорт модели чужих ручек в
 * Swagger kpi-report-sales не приносит. Это проверяет
 * `__tests__/brief-module-di.spec.ts` — вместе с тем, что ни ядро, ни
 * VibeCode не тянут PBXModule: источник резюме только кэш и снапшоты.
 *
 * Кэш, настройки, параметры, периметр и стор снапшотов — из ядра
 * (`AiAnalyticsCoreModule`). AppCacheService и WsService — глобальные.
 *
 * Все провайдеры — @Injectable без bitrix-состояния (CLAUDE.md про race
 * condition): домен приходит параметром.
 */
import { Module } from '@nestjs/common';
import { QueueModule } from 'src/modules/queue/queue.module';
import { VibecodeModule } from '@lib/vibecode';
import { PortalSessionModule } from '@lib/auth';
import { AiAnalyticsBriefController } from '../ai-analytics-brief.controller';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { BriefJobUseCase } from '../domain/use-cases/brief-job.use-case';
import { BriefUseCase } from '../domain/use-cases/brief.use-case';
import { AI_BRIEF_LLM_PORT } from './ai-brief-llm.port';
import { BriefQuotaStore } from './brief-quota.store';
import { EvidencePackBuilder } from './evidence-pack.builder';
import { VibeCodeBriefAdapter } from './vibecode-brief.adapter';

@Module({
    imports: [
        QueueModule,
        VibecodeModule,
        AiAnalyticsCoreModule,
        PortalSessionModule,
    ],
    controllers: [AiAnalyticsBriefController],
    providers: [
        EvidencePackBuilder,
        BriefQuotaStore,
        VibeCodeBriefAdapter,
        { provide: AI_BRIEF_LLM_PORT, useExisting: VibeCodeBriefAdapter },
        BriefUseCase,
        BriefJobUseCase,
    ],
    // Джоба резюме нужна процессору очереди (поток сборки), конверт
    // ручки — прогреву и соседним срезам.
    exports: [BriefUseCase, BriefJobUseCase],
})
export class AiAnalyticsBriefModule {}
