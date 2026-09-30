/**
 * Оценка формы звонка, страта базы и недельные средние для лида плацебо —
 * вспомогательные примитивы сборки выборки β (план `ai-sales-analytics`,
 * §4.4). Вынесены из `beta-sample.ts`, чтобы рабочий файл оставался в
 * пределах 300 строк.
 */
import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import type {
    AiBetaDropReason,
    AiBetaScoreSource,
    BetaLeadKindResolver,
    BetaSampleCall,
} from './beta-sample.types';
import { MS_PER_DAY } from './episode.types';
import { qualityScoreOfCall } from './quality-period';

/** Оценка формы звонка и её источник. */
export interface FormScore {
    readonly score: number;
    readonly source: AiBetaScoreSource;
}

/** Звонок с разобранным моментом времени (мс). */
export interface TimedCall {
    readonly call: BetaSampleCall;
    readonly ms: number;
}

/** Миллисекунд в неделе — шаг сдвига лида плацебо. */
export const MS_PER_WEEK = 7 * MS_PER_DAY;

export const meanOf = (values: readonly number[]): number =>
    values.reduce((acc, value) => acc + value, 0) / values.length;

/** Порядок звонков: момент, затем callId — детерминированный. */
export const compareTimedCalls = (a: TimedCall, b: TimedCall): number =>
    a.ms - b.ms || a.call.callId.localeCompare(b.call.callId);

/** Счётчики причин отбрасывания; полнота словаря проверяется компилятором. */
export const emptyDropped = (): Record<AiBetaDropReason, number> => ({
    'bad-time': 0,
    'no-link': 0,
    'no-episode': 0,
    control: 0,
    'not-trigger': 0,
    'no-score': 0,
    censored: 0,
});

/**
 * `S_i^form`: среднее оценок разделов формы с relevance > 0 (шкала 1–10);
 * без таких разделов — общий балл/10; null — оценки нет.
 */
export function formScoreOfCall(
    call: BetaSampleCall,
    formSections: readonly string[],
): FormScore | null {
    const form = new Set(formSections);
    const scores: number[] = [];
    call.sections.forEach(section => {
        if (
            form.has(section.section) &&
            section.relevance > 0 &&
            section.score !== null &&
            Number.isFinite(section.score)
        ) {
            scores.push(section.score);
        }
    });
    if (scores.length > 0) {
        return { score: meanOf(scores), source: 'form' };
    }
    if (call.score !== null && Number.isFinite(call.score)) {
        return { score: qualityScoreOfCall(call.score), source: 'total' };
    }

    return null;
}

/**
 * Страта по умолчанию: звонок по лиду → `lead`; сделка, начавшаяся с
 * холодной стадии → `cold`; иначе `request`.
 */
export const defaultLeadKindOf: BetaLeadKindResolver = (
    call,
    _episode,
    firstEpisode,
) => {
    if (call.entityType === 'lead') {
        return 'lead';
    }

    return firstEpisode.stageCode === PBX_DEAL_SALES_BASE_STAGE_CODE.cold
        ? 'cold'
        : 'request';
};

/** Ключ месяца `YYYY-MM` по дате ISO-строки (в TZ самой строки). */
export function betaMonthKeyOf(iso: string): string {
    return iso.slice(0, 7);
}

/**
 * Сдвиг эпохи до первого понедельника (1970-01-05, UTC): недели лида
 * плацебо считаются с понедельника, как в ISO-календаре, а не с четверга.
 */
const EPOCH_MONDAY_MS = 4 * MS_PER_DAY;

/** Индекс недели по моменту звонка (недели от понедельника 1970-01-05, UTC). */
export const weekIndexOf = (ms: number): number =>
    Math.floor((ms - EPOCH_MONDAY_MS) / MS_PER_WEEK);

/** Недельные средние S менеджеров — источник лида плацебо `S̄_{m,w+k}`. */
export function weeklyMeans(
    calls: readonly TimedCall[],
    formSections: readonly string[],
): Map<string, Map<number, number>> {
    const sums = new Map<string, Map<number, { sum: number; n: number }>>();
    calls.forEach(({ call, ms }) => {
        const form = formScoreOfCall(call, formSections);
        if (form === null) {
            return;
        }
        const weeks =
            sums.get(call.managerId) ??
            new Map<number, { sum: number; n: number }>();
        const week = weekIndexOf(ms);
        const cell = weeks.get(week) ?? { sum: 0, n: 0 };
        weeks.set(week, { sum: cell.sum + form.score, n: cell.n + 1 });
        sums.set(call.managerId, weeks);
    });
    const result = new Map<string, Map<number, number>>();
    sums.forEach((weeks, managerId) => {
        const means = new Map<number, number>();
        weeks.forEach((cell, week) => means.set(week, cell.sum / cell.n));
        result.set(managerId, means);
    });

    return result;
}
