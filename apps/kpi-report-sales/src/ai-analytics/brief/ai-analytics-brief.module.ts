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
 * `__tests__/brief-module-di.spec.ts`.
 *
 * Загрузчики и кэш продублированы с корневым модулем осознанно: они без
 * состояния, кэш общий (AppCache/Redis), зато срез не тянет за собой
 * контроллеры фичи. AppCacheService и WsService — глобальные.
 *
 * Все провайдеры — @Injectable без bitrix-состояния (CLAUDE.md про race
 * condition): домен приходит параметром.
 */
import { Module } from '@nestjs/common';
import { QueueModule } from 'src/modules/queue/queue.module';
import { AiModule } from '@lib/call-lib';
import { BxDepartmentModule } from '@lib/bx-department';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { VibecodeModule } from '@lib/vibecode';
import { AiAnalyticsBriefController } from '../ai-analytics-brief.controller';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { AiAnalyticsParamsLoader } from '../domain/loaders/params.loader';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { BriefJobUseCase } from '../domain/use-cases/brief-job.use-case';
import { BriefUseCase } from '../domain/use-cases/brief.use-case';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { AI_BRIEF_LLM_PORT } from './ai-brief-llm.port';
import { BriefQuotaStore } from './brief-quota.store';
import { EvidencePackBuilder } from './evidence-pack.builder';
import { VibeCodeBriefAdapter } from './vibecode-brief.adapter';

@Module({
    imports: [
        QueueModule,
        PortalAppSettingsModule,
        BxDepartmentModule,
        AiModule,
        VibecodeModule,
    ],
    controllers: [AiAnalyticsBriefController],
    providers: [
        AiAnalyticsCacheService,
        SettingsLoader,
        RequesterAccessService,
        AiAnalyticsParamsLoader,
        AiAnalyticsSnapshotStore,
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
