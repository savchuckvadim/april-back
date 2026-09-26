/**
 * Ядро общих провайдеров AI-аналитики (план Фазы 2, поток 19 «сборка»;
 * долг N8 аудита 14.09.2026: кэш, загрузчики настроек и ростера, стор
 * снапшотов и периметр были объявлены провайдерами в шести модулях).
 *
 * Каждый провайдер без состояния объявлен здесь ОДИН раз и экспортирован:
 * модули срезов (`snapshots/`, `passport/`, `stage-history/`, `rop-mark/`,
 * `portal-model/`, `plan/`, `brief/`, `style/`, `pipeline/`) и корневой
 * модуль фичи импортируют ядро вместо собственных копий. Экземпляр в
 * приложении один, кэш общий (AppCache/Redis).
 *
 * ⚠ Ядро НЕ импортирует PBXModule. Срезы плана дня и резюме обязаны
 * оставаться без Битрикса (их DI-спеки проверяют транзитивные импорты —
 * `plan-module-di.spec.ts`, `brief-module-di.spec.ts`), а поддерево
 * PBXModule к тому же несёт чужие контроллеры (TelegramController,
 * FrontPortalController). Загрузчики, которым нужен PBXService (KPI,
 * финансы, планы руководителя, стор настроек), живут в соседнем
 * `AiAnalyticsCorePbxModule`.
 *
 * Импорты — только сервисные модули без контроллеров
 * (ai/rules/app-api-surface.md): AiModule (ais-записи снапшотов),
 * CallReportAnalyticsCoreModule (лёгкая выборка разборов),
 * PortalAppSettingsModule (ключи [kpiSales]) и BxDepartmentModule
 * (структура отделов для ростера и периметра; его роуты приложение
 * публикует само, поэтому DI-спеки его поддерево не раскрывают).
 *
 * Все провайдеры — @Injectable без bitrix-состояния (CLAUDE.md про race
 * condition): портал приходит параметром domain.
 */
import { Module, Type } from '@nestjs/common';
import { AiModule, CallReportAnalyticsCoreModule } from '@lib/call-lib';
import { BxDepartmentModule } from '@lib/bx-department';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { CallsLoader } from '../domain/loaders/calls.loader';
import { ManagerOrgLoader } from '../domain/loaders/manager-org.loader';
import { ManagersLoader } from '../domain/loaders/managers.loader';
import { AiAnalyticsParamsLoader } from '../domain/loaders/params.loader';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { AiAnalyticsFeedbackStore } from '../store/ai-analytics-feedback.store';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';

/**
 * Состав ядра (экспортируется целиком — DI-спека сборки сверяет, что
 * ядро отдаёт наружу ровно то, что объявляет).
 */
export const AI_ANALYTICS_CORE_PROVIDERS: Type<unknown>[] = [
    AiAnalyticsCacheService,
    SettingsLoader,
    AiAnalyticsParamsLoader,
    AiAnalyticsPortalsLoader,
    ManagersLoader,
    // Раскладка ростера по отделам: строки обзора, сводный дайджест и
    // отдел в паспорте менеджера (Фаза 3, П3).
    ManagerOrgLoader,
    CallsLoader,
    AiAnalyticsSnapshotStore,
    // Обратная связь (ais, без Битрикса): витрина, push-контур и отзыв с сайта.
    AiAnalyticsFeedbackStore,
    RequesterAccessService,
];

@Module({
    imports: [
        AiModule,
        CallReportAnalyticsCoreModule,
        PortalAppSettingsModule,
        // Старая админка разбора (portal_ai_settings): запасной скаляр порога
        // длительности для SettingsLoader; модуль без контроллеров.
        PortalStoreModule,
        BxDepartmentModule,
    ],
    providers: AI_ANALYTICS_CORE_PROVIDERS,
    exports: AI_ANALYTICS_CORE_PROVIDERS,
})
export class AiAnalyticsCoreModule {}
