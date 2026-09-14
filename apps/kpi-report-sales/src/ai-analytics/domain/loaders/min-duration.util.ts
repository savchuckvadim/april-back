/**
 * Единый порог «разбираемого» звонка портала (решение владельца А.1,
 * P2-56; план Фазы 2, поток 14c): карта определений
 * `ai_analytics_definitions.minDurationSecByType` и значение реестра
 * `min_duration_sec_by_type`, разрешённое с контекстом портала
 * (`buildRegistryContext` собирает те же слои, что AiAnalyticsParamsLoader
 * отдаёт шагам конвейера в `ctx.registry`).
 *
 * Один вход для пульса, недельного и месячного снапшотов: разъехавшийся
 * порог развёл бы знаменатель пульса и набор разбираемых звонков
 * конвейера (аудит Фазы 2, M2). Портал ничего не решал — дефолт реестра
 * 300 с, то есть поведение Фазы 1a бит-в-бит.
 *
 * Чистая функция без DI и Bitrix.
 */
import {
    buildRegistryContext,
    minDurationByType,
    resolveNumberParam,
    type MinDurationSecByType,
} from '@lib/sales-ai-analytics';
import type { AiAnalyticsPortalSettings } from './settings.loader';

export function portalMinDurationByType(
    settings: AiAnalyticsPortalSettings,
): MinDurationSecByType {
    const ctx = buildRegistryContext({
        modelParams: settings.modelParams,
        definitions: settings.definitions,
    });

    return minDurationByType(
        settings.definitions.minDurationSecByType,
        resolveNumberParam('min_duration_sec_by_type', ctx),
    );
}
