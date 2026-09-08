import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_PARAM_DEFAULTS,
    paramsVersion,
    REGISTRY_VERSION,
} from '@lib/sales-ai-analytics';
import type {
    JsonObject,
    ParamContext,
} from '@lib/sales-ai-analytics/params/index';
import { comparableFromEvents } from '@lib/sales-ai-analytics/settings/ai-settings.series';
import type { AiManagerLevelCode } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import {
    buildRegistryContext,
    type AiModelEstimates,
} from '@lib/sales-ai-analytics/settings/registry-context.builder';
import { SettingsLoader } from './settings.loader';

/** Для кого разрешаются параметры: портал, полоса стажа, менеджер. */
export interface AiParamsLoadOptions {
    /** Bitrix-id менеджера — слой `manager` и личная цель. */
    managerId?: string;
    /** Полоса стажа (она же уровень) — слой `tenureBand`. */
    tenureBand?: AiManagerLevelCode;
    /** Оценки снапшота `ai-analytics-portal-model` за месяц. */
    model?: AiModelEstimates;
}

/** Разрешённые параметры портала: контекст, версия и граница истории. */
export interface AiResolvedParams {
    /** Слои для `resolveParam` (менеджер → полоса → портал → дефолт). */
    ctx: ParamContext;
    /** sha256 эффективных настроек всех слоёв + версии состава реестра. */
    paramsVersion: string;
    /** Начало сравнимой истории по журналу событий; '' — не рвалась. */
    comparableFrom: string;
}

/** Слой контекста в форме канонического JSON (для хэша версии). */
const asJson = (layer: ParamContext[keyof ParamContext]): JsonObject =>
    (layer ?? {}) as JsonObject;

/**
 * Загрузчик параметров расчёта: настройки портала (десять ключей схемы) →
 * контекст реестра → `paramsVersion`. Один вход для всех потребителей
 * Фазы 2 (портальная модель, план дня, резюме, снапшоты), чтобы
 * раскладка настроек по слоям не повторялась в каждом шаге.
 *
 * `@Injectable` без bitrix-состояния: только SettingsLoader.
 */
@Injectable()
export class AiAnalyticsParamsLoader {
    constructor(private readonly settings: SettingsLoader) {}

    async load(
        domain: string,
        options: AiParamsLoadOptions = {},
    ): Promise<AiResolvedParams> {
        const settings = await this.settings.load(domain);
        const ctx = buildRegistryContext({
            modelParams: settings.modelParams,
            definitions: settings.definitions,
            targets: settings.targets,
            managerParams: options.managerId
                ? settings.managerParams[options.managerId]
                : undefined,
            ...(options.managerId ? { managerId: options.managerId } : {}),
            ...(options.tenureBand ? { tenureBand: options.tenureBand } : {}),
            ...(options.model ? { model: options.model } : {}),
        });

        return {
            ctx,
            paramsVersion: paramsVersion({
                globalDefaults: AI_ANALYTICS_PARAM_DEFAULTS as JsonObject,
                portalParams: asJson(ctx.portal),
                tenureParams: asJson(ctx.tenureBand),
                managerParams: asJson(ctx.manager),
                registryVersion: REGISTRY_VERSION,
            }),
            comparableFrom: comparableFromEvents(settings.events),
        };
    }
}
