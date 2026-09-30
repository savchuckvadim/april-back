/**
 * Факты эффекта советов (план §10 L5; поток B2b), не зависящие от DI:
 * окно «до/после» по реестру, параметры гейта L5 с переопределениями
 * портала и сводка флагов Гудхарта из последних трендов менеджеров.
 *
 * Отделено от `recommendation-effect.step.ts` по образцу
 * `forecast.facts.ts`. Чистые функции: без DI, Bitrix и `new Date()`.
 */
import {
    RECOMMENDATION_EFFECT_PARAM_CODES,
    registryDefault,
    resolveNumberParam,
    type GoodhartCleanInput,
    type ParamContext,
    type RecommendationEffectParams,
} from '@lib/sales-ai-analytics';
import { shiftMonth } from '../constants/ai-dossier.const';
import { monthBounds } from '../constants/ai-manager-snapshot.const';
import { AI_RECOMMENDATION_GOODHART_WEEKS } from '../constants/ai-recommendation-effect.const';
import { trendWeekKeys } from '../constants/ai-trend.const';
import { isoWeekKey } from '../domain/loaders/period.util';
import type { AiAnalyticsSnapshotRecord } from '../store/ai-analytics-snapshot.store';

/** Окно эффекта: месяц выдачи и закрытые месяцы «до» и «после». */
export interface RecommendationEffectWindow {
    /** Месяц выдачи советов 'YYYY-MM'. */
    readonly issuedMonth: string;
    /** Месяцы «до» по возрастанию: [M − before; M − 1]. */
    readonly beforeMonths: readonly string[];
    /** Месяцы «после» по возрастанию: [M + 1; M + after]. */
    readonly afterMonths: readonly string[];
}

/** Целое число месяцев ≥ 1 из реестра портала. */
function monthsParam(value: number | undefined, fallback: number): number {
    const months = Math.round(value ?? fallback);

    return Number.isFinite(months) && months >= 1 ? months : 1;
}

/** Месяцы подряд от `from` (включительно) длиной `count`. */
function monthRun(from: string, count: number): string[] {
    return Array.from({ length: count }, (_, index) => shiftMonth(from, index));
}

/**
 * Окно эффекта для месяца расчёта: советы месяца
 * `M = monthKey − lever_effect_months_after`, чтобы окно «после»
 * закончилось закрытым месяцем расчёта.
 */
export function effectWindowOf(
    monthKey: string,
    registry: ParamContext,
): RecommendationEffectWindow {
    const after = monthsParam(
        resolveNumberParam('lever_effect_months_after', registry),
        registryDefault('lever_effect_months_after'),
    );
    const before = monthsParam(
        resolveNumberParam('lever_effect_months_before', registry),
        registryDefault('lever_effect_months_before'),
    );
    const issuedMonth = shiftMonth(monthKey, -after);

    return {
        issuedMonth,
        beforeMonths: monthRun(shiftMonth(issuedMonth, -before), before),
        afterMonths: monthRun(shiftMonth(issuedMonth, 1), after),
    };
}

/**
 * Параметры гейта L5 с переопределениями портала; незаданное остаётся
 * undefined — библиотека подставит дефолт реестра и обрежет по диапазону.
 */
export function effectParamsOf(
    registry: ParamContext,
): RecommendationEffectParams {
    const codes = RECOMMENDATION_EFFECT_PARAM_CODES;

    return {
        minIssued: resolveNumberParam(codes.minIssued, registry),
        doneShareMin: resolveNumberParam(codes.doneShareMin, registry),
        disagreeMax: resolveNumberParam(codes.disagreeMax, registry),
        minN: resolveNumberParam(codes.minN, registry),
        z: resolveNumberParam(codes.z, registry),
    };
}

/** Недели трендов, в которых ищется последний снапшот к концу месяца. */
export function goodhartWeekKeys(monthKey: string): string[] {
    return trendWeekKeys(
        isoWeekKey(monthBounds(monthKey).to),
        AI_RECOMMENDATION_GOODHART_WEEKS,
    );
}

/** Число флагов Гудхарта в нагрузке трендов; чужая форма → 0. */
function flagsOf(payload: unknown): number {
    if (typeof payload !== 'object' || payload === null) return 0;
    const goodhart = (payload as { goodhart?: unknown }).goodhart;
    if (typeof goodhart !== 'object' || goodhart === null) return 0;
    const flags = (goodhart as { flags?: unknown }).flags;

    return Array.isArray(flags) ? flags.length : 0;
}

/**
 * Флаги Гудхарта по последнему снапшоту трендов каждого менеджера
 * ростера; трендов нет ни у кого — null (контроль не применяется).
 */
export function goodhartOf(
    records: readonly AiAnalyticsSnapshotRecord[],
    roster: readonly string[],
): GoodhartCleanInput | null {
    const allowed = new Set(roster);
    const latest = new Map<string, AiAnalyticsSnapshotRecord>();
    for (const record of records) {
        if (record.managerId === null || !allowed.has(record.managerId)) {
            continue;
        }
        const current = latest.get(record.managerId);
        if (current === undefined || current.periodKey <= record.periodKey) {
            latest.set(record.managerId, record);
        }
    }
    if (latest.size === 0) return null;
    let flags = 0;
    let managersWithFlags = 0;
    for (const record of latest.values()) {
        const count = flagsOf(record.payload);
        flags += count;
        if (count > 0) managersWithFlags += 1;
    }

    return { flags, managersWithFlags };
}
