/**
 * Дефолты блоков настроек портала. Числа берутся из **реестра параметров**
 * (`params/registry.*.const.ts`), а не дублируются литералами: реестр —
 * единственный источник величин модели (план, §2), и правка дефолта в
 * одном месте не должна расходиться с формой настроек.
 *
 * Чистые функции и константы: без DI, Bitrix и Prisma.
 */
import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    PBX_DEAL_SALES_BASE_STAGES,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import type { PbxDealSalesBaseStageCode } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { findParam } from '../params/registry.const';
import {
    HOT_CLIENT_DEFINITION_DEFAULT,
    HOT_CLIENT_STAGE_FROM_PREFIX,
} from '../params/registry.definitions.const';
import {
    AI_DURATION_CALL_TYPES,
    AI_FUNNEL_EDGE_CODES,
    AI_HOT_CLIENT_COLORS,
    AI_MANAGER_LEVELS,
    type AiHotClientColor,
    type AiLevelTarget,
    type AiManagerLevelCode,
    type AiMinDurationByType,
    type AiPortalDefinitions,
    type AiTargets,
} from './ai-settings.types';

/** Все коды стадий воронки sales_base — справочник для `decisionStages`. */
export const AI_SALES_STAGE_CODES: readonly PbxDealSalesBaseStageCode[] =
    PBX_DEAL_SALES_BASE_STAGES.map(stage => stage.code);

/** Числовой дефолт кода реестра; отсутствующий код → запасное значение. */
export function registryNumber(code: string, fallback: number): number {
    const value = findParam(code)?.defaultValue;
    return typeof value === 'number' ? value : fallback;
}

/** Строковый дефолт кода реестра; отсутствующий код → запасное значение. */
export function registryText(code: string, fallback: string): string {
    const value = findParam(code)?.defaultValue;
    return typeof value === 'string' ? value : fallback;
}

/** Диапазон кода реестра; отсутствующий код → запасные границы. */
export function registryRange(
    code: string,
    fallback: readonly [number, number],
): readonly [number, number] {
    const range = findParam(code)?.range;
    return range ? [range[0], range[1]] : fallback;
}

/** Значение из карты «тип:значение» реестра (`cap_level_activity`). */
function fromCapMap(code: string, key: string, fallback: number): number {
    const raw = registryText(code, '');
    for (const chunk of raw.split(',')) {
        const [name, value] = chunk.split(':');
        if (name?.trim() === key) {
            const numeric = Number(value);
            if (Number.isFinite(numeric)) return numeric;
        }
    }
    return fallback;
}

/** Порог длительности разбора по типам: один код реестра на все типы (А.1). */
export function defaultMinDurationByType(): AiMinDurationByType {
    const seconds = registryNumber('min_duration_sec_by_type', 300);
    return Object.fromEntries(
        AI_DURATION_CALL_TYPES.map(code => [code, seconds]),
    ) as AiMinDurationByType;
}

/** Стадия-порог «горячего» из правила `stage_from:<код>`; чужой код → А.2. */
export function hotStageOf(rule: string): PbxDealSalesBaseStageCode {
    const code = rule.startsWith(HOT_CLIENT_STAGE_FROM_PREFIX)
        ? rule.slice(HOT_CLIENT_STAGE_FROM_PREFIX.length)
        : rule;
    return (AI_SALES_STAGE_CODES as readonly string[]).includes(code)
        ? (code as PbxDealSalesBaseStageCode)
        : PBX_DEAL_SALES_BASE_STAGE_CODE.inProgress;
}

/** Цвета «горячих» из CSV-дефолта реестра. */
function defaultHotColors(): readonly AiHotClientColor[] {
    const raw = registryText('hot_client_colors', 'green,yellow,red,none');
    const colors = raw
        .split(',')
        .map(item => item.trim())
        .filter((item): item is AiHotClientColor =>
            (AI_HOT_CLIENT_COLORS as readonly string[]).includes(item),
        );
    return colors.length > 0 ? colors : AI_HOT_CLIENT_COLORS;
}

/**
 * Стадии «решения» (план, §2.1 `decision_stages`): подготовка КП, отправка
 * документов и «В решении» — только коды лестницы, без magic strings.
 */
export const AI_DEFAULT_DECISION_STAGES: readonly PbxDealSalesBaseStageCode[] =
    [
        PBX_DEAL_SALES_BASE_STAGE_CODE.offerCreate,
        PBX_DEAL_SALES_BASE_STAGE_CODE.documentSend,
        PBX_DEAL_SALES_BASE_STAGE_CODE.inProgress,
    ];

/** Определения событий по умолчанию (что считать чем до решения РОПа). */
export function defaultDefinitions(): AiPortalDefinitions {
    const hotClient = registryText(
        'hot_client_definition',
        HOT_CLIENT_DEFINITION_DEFAULT,
    );
    return {
        productiveCall: 'kpi_done',
        presentationCanon: 'presentation_uniq_done',
        confirmedOnly: false,
        hotClient,
        hotStageCode: hotStageOf(hotClient),
        minDurationSecByType: defaultMinDurationByType(),
        invoiceNesting: 'disjoint',
        callDoneIncludesSiteComeCall: false,
        decisionStages: AI_DEFAULT_DECISION_STAGES,
        funnelEdges: AI_FUNNEL_EDGE_CODES,
        normStratum: 'tenure',
        hotClientColors: defaultHotColors(),
    };
}

/**
 * Обучающий минимум презентаций по уровням (решение владельца, §2.1
 * `training_min_presentations`): новичку 20, остальным 0.
 */
const TRAINING_MIN_PRESENTATIONS: Readonly<Record<AiManagerLevelCode, number>> =
    { junior: 20, middle: 0, senior: 0 };

/** Цель уровня по умолчанию: продажи — медианой полосы (null). */
export function defaultLevelTarget(level: AiManagerLevelCode): AiLevelTarget {
    return {
        sales: null,
        presentationsMin: TRAINING_MIN_PRESENTATIONS[level],
        coldPerDay: fromCapMap('cap_level_activity', 'cold', 40),
    };
}

/** Цели по умолчанию: у каждого уровня своя строка, переопределений нет. */
export function defaultTargets(): AiTargets {
    return {
        byLevel: Object.fromEntries(
            AI_MANAGER_LEVELS.map(level => [level, defaultLevelTarget(level)]),
        ) as Readonly<Record<AiManagerLevelCode, AiLevelTarget>>,
        overrides: {},
    };
}
