/**
 * Сборка контекста реестра параметров из настроек портала (план Фазы 2,
 * §2: «resolve идёт снизу вверх — менеджер → полоса стажа → портал →
 * глобальный дефолт»).
 *
 * Здесь только раскладка настроек по слоям: значение, тип и диапазон
 * проверяет `resolveParam` по дескриптору реестра. Слои типизированы
 * кодами реестра (`AiModelParams`), поэтому код без дескриптора не
 * компилируется — `unknown-code` на этих ключах невозможен. Порядок внутри
 * слоя портала важен — **решение человека кладётся поверх оценки из
 * данных**: оценки приезжают снапшотом `ai-analytics-portal-model`,
 * настройки — ключами схемы, и настройка обязана побеждать.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import type { AiAnalyticsParamCode } from '../params/registry.const';
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

/**
 * Поле определений портала → код реестра. Единый источник и для слоя
 * портала, и для признака `breaksSeries` при сохранении настроек
 * (`ai-settings.series.ts`): тумблер `confirmedOnly` — часть канона
 * презентации, `hotStageCode` — производное от правила «горячего».
 */
export const AI_DEFINITION_PARAM_CODES = {
    productiveCall: 'productive_call_definition',
    presentationCanon: 'presentation_canon',
    confirmedOnly: 'presentation_confirmed_only',
    hotClient: 'hot_client_definition',
    hotStageCode: 'hot_client_definition',
    minDurationSecByType: 'min_duration_sec_by_type',
    invoiceNesting: 'invoice_nesting',
    callDoneIncludesSiteComeCall: 'call_done_includes_site_come_call',
    decisionStages: 'decision_stages',
    funnelEdges: 'funnel_edges',
    normStratum: 'norm_stratum',
    hotClientColors: 'hot_client_colors',
} as const satisfies Readonly<
    Record<keyof AiPortalDefinitions, AiAnalyticsParamCode>
>;

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
function definitionsLayer(definitions: AiPortalDefinitions): AiModelParams {
    const codes = AI_DEFINITION_PARAM_CODES;
    const durations = Object.values(definitions.minDurationSecByType);
    const uniform = new Set(durations).size === 1 ? durations[0] : undefined;
    return {
        [codes.hotClient]: definitions.hotClient,
        [codes.hotClientColors]: definitions.hotClientColors.join(','),
        [codes.normStratum]: definitions.normStratum,
        [codes.invoiceNesting]: definitions.invoiceNesting,
        [codes.productiveCall]: definitions.productiveCall,
        [codes.presentationCanon]: definitions.presentationCanon,
        [codes.confirmedOnly]: definitions.confirmedOnly,
        [codes.callDoneIncludesSiteComeCall]:
            definitions.callDoneIncludesSiteComeCall,
        [codes.decisionStages]: definitions.decisionStages.join(','),
        [codes.funnelEdges]: definitions.funnelEdges.join(','),
        // Скалярный код реестра заполняется только когда порог одинаков у
        // всех типов: разные пороги — это карта, а не одно значение.
        ...(uniform === undefined
            ? {}
            : { [codes.minDurationSecByType]: uniform }),
    };
}

/** Цели полосы стажа → коды реестра слоя `tenureBand`. */
function tenureLayer(
    targets: AiTargets,
    band: AiManagerLevelCode,
): AiModelParams {
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
): AiModelParams {
    const layer: Partial<Record<AiAnalyticsParamCode, ParamPrimitive>> = {};
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
    if (params?.workweek !== undefined) {
        layer.workweek = params.workweek.join(',');
    }
    if (params?.timeZone !== undefined) {
        layer.time_zone = params.timeZone;
    }
    const personal = params?.targetOverride ?? override;
    if (typeof personal === 'number') {
        layer.target_override = personal;
    }
    return layer;
}

/** Слой без ключей не создаётся: «слой ничего не решал». */
const nonEmpty = (
    layer: Readonly<Record<string, ParamPrimitive | undefined>>,
): Record<string, ParamPrimitive> | undefined => {
    const entries = Object.entries(layer).filter(
        (entry): entry is [string, ParamPrimitive] => entry[1] !== undefined,
    );
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

/**
 * Контекст `resolveParam` для портала, полосы стажа и менеджера. Пустые
 * слои не создаются: отсутствие ключа в слое означает «слой ничего не
 * решал», и `resolveParam` уходит ниже — до глобального дефолта реестра.
 */
export function buildRegistryContext(
    input: RegistryContextInput,
): ParamContext {
    const portal = nonEmpty({
        ...(input.model ?? {}),
        ...(input.definitions ? definitionsLayer(input.definitions) : {}),
        ...(input.modelParams ?? {}),
    });
    const tenureBand = nonEmpty(
        input.targets && input.tenureBand
            ? tenureLayer(input.targets, input.tenureBand)
            : {},
    );
    const manager = nonEmpty(
        managerLayer(
            input.managerParams,
            input.managerId
                ? input.targets?.overrides[input.managerId]
                : undefined,
        ),
    );
    return {
        ...(portal ? { portal } : {}),
        ...(tenureBand ? { tenureBand } : {}),
        ...(manager ? { manager } : {}),
    };
}
