/**
 * Сборка контекста реестра параметров из настроек портала (план Фазы 2,
 * §2: «resolve идёт снизу вверх — менеджер → полоса стажа → портал →
 * глобальный дефолт»).
 *
 * Здесь только раскладка настроек по слоям: значение, тип и диапазон
 * проверяет `resolveParam` по дескриптору реестра. Порядок внутри слоя
 * портала важен — **решение человека кладётся поверх оценки из данных**:
 * оценки приезжают снапшотом `ai-analytics-portal-model`, настройки —
 * ключами схемы, и настройка обязана побеждать.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import type { ParamContext, ParamPrimitive } from '../params/registry.types';
import type {
    AiManagerLevelCode,
    AiManagerParams,
    AiModelParams,
    AiPortalDefinitions,
    AiTargets,
} from './ai-settings.types';

/** Оценки портальной модели за месяц: код реестра → значение. */
export type AiModelEstimates = Readonly<Record<string, ParamPrimitive>>;

export interface RegistryContextInput {
    /** `ai_analytics_model_params` — гиперпараметры, решённые порталом. */
    modelParams?: AiModelParams;
    /** `ai_analytics_definitions` — определения событий портала. */
    definitions?: AiPortalDefinitions;
    /** `ai_analytics_targets` — цели по уровням и переопределения. */
    targets?: AiTargets;
    /** Полоса стажа (она же уровень) менеджера, для слоя `tenureBand`. */
    tenureBand?: AiManagerLevelCode;
    /** Слой конкретного менеджера из `ai_analytics_manager_params`. */
    managerParams?: AiManagerParams;
    /** Bitrix-id менеджера — для личной цели из `targets.overrides`. */
    managerId?: string;
    /** Оценки из снапшота портальной модели (нижняя часть слоя портала). */
    model?: AiModelEstimates;
}

/** Определения событий → коды реестра слоя портала. */
function definitionsLayer(
    definitions: AiPortalDefinitions,
): Record<string, ParamPrimitive> {
    const durations = Object.values(definitions.minDurationSecByType);
    const uniform = new Set(durations).size === 1 ? durations[0] : undefined;
    return {
        hot_client_definition: definitions.hotClient,
        hot_client_colors: definitions.hotClientColors.join(','),
        norm_stratum: definitions.normStratum,
        invoice_nesting: definitions.invoiceNesting,
        productive_call_definition: definitions.productiveCall,
        presentation_canon: definitions.presentationCanon,
        call_done_includes_site_come_call:
            definitions.callDoneIncludesSiteComeCall,
        decision_stages: definitions.decisionStages.join(','),
        funnel_edges: definitions.funnelEdges.join(','),
        // Скалярный код реестра заполняется только когда порог одинаков у
        // всех типов: разные пороги — это карта, а не одно значение.
        ...(uniform === undefined ? {} : { min_duration_sec_by_type: uniform }),
    };
}

/** Цели полосы стажа → коды реестра слоя `tenureBand`. */
function tenureLayer(
    targets: AiTargets,
    band: AiManagerLevelCode,
): Record<string, ParamPrimitive> {
    const target = targets.byLevel[band];
    if (!target) return {};
    return {
        training_min_presentations: target.presentationsMin,
        cap_cold: target.coldPerDay,
        ...(target.sales === null
            ? {}
            : { target_sales_by_level: target.sales }),
    };
}

/** Слой менеджера: ставка, личная цель, исключение из норм, обучение. */
function managerLayer(
    params: AiManagerParams | undefined,
    override: number | null | undefined,
): Record<string, ParamPrimitive> {
    const layer: Record<string, ParamPrimitive> = {};
    if (params?.fteShare !== undefined) {
        layer.fte_share = params.fteShare;
        layer.fte_share_default = params.fteShare;
    }
    if (params?.trainingMinPresentations !== undefined) {
        layer.training_min_presentations = params.trainingMinPresentations;
    }
    if (params?.excludeFromNorms !== undefined) {
        layer.exclude_from_norms = params.excludeFromNorms;
    }
    const personal = params?.targetOverride ?? override;
    if (typeof personal === 'number') {
        layer.target_override = personal;
    }
    return layer;
}

/**
 * Контекст `resolveParam` для портала, полосы стажа и менеджера. Пустые
 * слои не создаются: отсутствие ключа в слое означает «слой ничего не
 * решал», и `resolveParam` уходит ниже — до глобального дефолта реестра.
 */
export function buildRegistryContext(
    input: RegistryContextInput,
): ParamContext {
    const portal: Record<string, ParamPrimitive> = {
        ...(input.model ?? {}),
        ...(input.definitions ? definitionsLayer(input.definitions) : {}),
        ...(input.modelParams ?? {}),
    };
    const tenureBand =
        input.targets && input.tenureBand
            ? tenureLayer(input.targets, input.tenureBand)
            : {};
    const manager = managerLayer(
        input.managerParams,
        input.managerId ? input.targets?.overrides[input.managerId] : undefined,
    );
    return {
        ...(Object.keys(portal).length > 0 ? { portal } : {}),
        ...(Object.keys(tenureBand).length > 0 ? { tenureBand } : {}),
        ...(Object.keys(manager).length > 0 ? { manager } : {}),
    };
}
