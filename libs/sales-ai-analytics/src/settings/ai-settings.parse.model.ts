/**
 * Парсеры блоков «как считаем» (план Фазы 2, §3.3): определения событий,
 * гиперпараметры реестра, потолки оценивания и гипотеза «качество → объём».
 *
 * Вынесены из `ai-settings.parse.ts` только ради правила «файл ≤ 300
 * строк»: контракт прежний — все десять парсеров доступны из
 * `settings/ai-settings.parse`. Битый JSON → дефолт кода, без исключения.
 */
import { CALL_REPORT_SECTION_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import type { CallReportCallTypeCode } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { AI_ANALYTICS_PARAM_CODES } from '../params/registry.const';
import {
    AI_SALES_STAGE_CODES,
    defaultDefinitions,
    hotStageOf,
} from './ai-settings.defaults';
import {
    asArray,
    asFlag,
    asIsoDate,
    asNumber,
    asNumberIn,
    asOneOf,
    asRecord,
    asSubsetOf,
    asText,
    parseJsonValue,
} from './ai-settings.json';
import {
    AI_FUNNEL_EDGE_CODES,
    AI_HOT_CLIENT_COLORS,
    AI_INVOICE_NESTINGS,
    AI_NORM_STRATA,
    AI_SETTINGS_LIMITS,
    type AiMinDurationByType,
    type AiModelParams,
    type AiPortalDefinitions,
    type AiQualityHypothesis,
    type AiScoringCapRule,
    type AiScoringSettings,
} from './ai-settings.types';

/**
 * `ai_analytics_model_params` → переопределения кодов реестра. Неизвестный
 * код отбрасывается здесь, диапазон и тип проверяет `resolveParam`: реестр
 * остаётся единственным источником границ, DTO их не дублирует.
 */
export function parseAiModelParams(
    json: string | null | undefined,
): AiModelParams {
    const root = asRecord(parseJsonValue(json));
    if (!root) return {};
    const known = new Set<string>(AI_ANALYTICS_PARAM_CODES);
    const result: Record<string, number | string | boolean> = {};
    for (const [code, value] of Object.entries(root)) {
        if (!known.has(code)) continue;
        if (
            typeof value === 'number' ||
            typeof value === 'string' ||
            typeof value === 'boolean'
        ) {
            result[code] = value;
        }
    }
    return result as AiModelParams;
}

/** Пороги длительности по типам: заданные типы поверх дефолта реестра. */
function parseMinDuration(
    raw: unknown,
    fallback: AiMinDurationByType,
): AiMinDurationByType {
    const item = asRecord(raw);
    if (!item) return fallback;
    const result: Record<string, number> = { ...fallback };
    for (const [type, value] of Object.entries(item)) {
        if (!(type in fallback)) continue;
        const seconds = asNumber(value);
        if (seconds !== undefined && seconds > 0) {
            result[type as CallReportCallTypeCode] = seconds;
        }
    }
    return result as AiMinDurationByType;
}

/** `ai_analytics_definitions` → определения событий портала. */
export function parseAiDefinitions(
    json: string | null | undefined,
): AiPortalDefinitions {
    const root = asRecord(parseJsonValue(json));
    const defaults = defaultDefinitions();
    if (!root) return defaults;
    const hotClient = asText(root.hotClient) ?? defaults.hotClient;
    return {
        productiveCall: asText(root.productiveCall) ?? defaults.productiveCall,
        presentationCanon:
            asText(root.presentationCanon) ?? defaults.presentationCanon,
        confirmedOnly: asFlag(root.confirmedOnly) ?? defaults.confirmedOnly,
        hotClient,
        hotStageCode: hotStageOf(hotClient),
        minDurationSecByType: parseMinDuration(
            root.minDurationSecByType,
            defaults.minDurationSecByType,
        ),
        invoiceNesting:
            asOneOf(root.invoiceNesting, AI_INVOICE_NESTINGS) ??
            defaults.invoiceNesting,
        callDoneIncludesSiteComeCall:
            asFlag(root.callDoneIncludesSiteComeCall) ??
            defaults.callDoneIncludesSiteComeCall,
        decisionStages:
            asSubsetOf(root.decisionStages, AI_SALES_STAGE_CODES) ??
            defaults.decisionStages,
        funnelEdges:
            asSubsetOf(root.funnelEdges, AI_FUNNEL_EDGE_CODES) ??
            defaults.funnelEdges,
        normStratum:
            asOneOf(root.normStratum, AI_NORM_STRATA) ?? defaults.normStratum,
        hotClientColors:
            asSubsetOf(root.hotClientColors, AI_HOT_CLIENT_COLORS) ??
            defaults.hotClientColors,
    };
}

/** Одно правило потолка оценки; без кода, раздела или балла → null. */
function parseCapRule(raw: unknown): AiScoringCapRule | null {
    const item = asRecord(raw);
    const ruleCode = item && asText(item.ruleCode);
    const section = item && asOneOf(item.section, CALL_REPORT_SECTION_CODES);
    const maxScore =
        item && asNumberIn(item.maxScore, AI_SETTINGS_LIMITS.capMaxScore);
    if (!item || !ruleCode || !section || maxScore === undefined) return null;
    return {
        ruleCode,
        condition: asText(item.condition) ?? '',
        section,
        maxScore,
        flag: asText(item.flag) ?? ruleCode,
    };
}

/** `ai_analytics_scoring` → потолки оценивания и стоп-фразы. */
export function parseAiScoring(
    json: string | null | undefined,
): AiScoringSettings {
    const root = asRecord(parseJsonValue(json));
    if (!root) return { caps: [], stopWords: [] };
    const caps = asArray(root.caps)
        .flatMap(raw => {
            const rule = parseCapRule(raw);
            return rule ? [rule] : [];
        })
        .slice(0, AI_SETTINGS_LIMITS.capsMax);
    const stopWords = [
        ...new Set(
            asArray(root.stopWords).flatMap(item => {
                const word = asText(item);
                return word ? [word] : [];
            }),
        ),
    ].slice(0, AI_SETTINGS_LIMITS.stopWordsMax);
    return { caps, stopWords };
}

/** `ai_analytics_hypothesis` → гипотеза «качество → объём»; иначе null. */
export function parseAiHypothesis(
    json: string | null | undefined,
): AiQualityHypothesis | null {
    const root = asRecord(parseJsonValue(json));
    if (!root) return null;
    const pairs = asArray(root.pairs).flatMap(raw => {
        const item = asRecord(raw);
        const score =
            item && asNumberIn(item.s, AI_SETTINGS_LIMITS.hypothesisScore);
        const volume = item && asNumber(item.n);
        if (score === undefined || volume === undefined || volume <= 0) {
            return [];
        }
        return [{ s: score, n: volume }];
    });
    if (pairs.length < AI_SETTINGS_LIMITS.hypothesisPairsMin) return null;
    return {
        pairs,
        since: asIsoDate(root.since) ?? '',
        author: asText(root.author) ?? '',
    };
}
