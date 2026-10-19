/**
 * Согласие СТАРОЙ и НОВОЙ версии промпта на парах «старый разбор —
 * переразбор того же звонка» (план 2026-10-19-ai-focus-plan.md, этап 1B).
 *
 * Отличие от `buildGoldenReport` (две прогонки одной версии): пары идут
 * из разных версий, поэтому к общему отчёту добавляется разбивка по
 * старой версии промпта — число пар, ICC и σ по общему баллу, средний
 * сдвиг «новая − старая» общего балла и оценок разделов. По нему владелец
 * решает, объявлять ли старые серии совместимыми. Чистая функция.
 */
import type { GoldenReport } from '../../contracts/golden-report.types';
import {
    AgreementPair,
    buildGoldenReport,
    scalePairsOf,
    sigmaOfPairs,
} from './agreement-report';
import type { IccAnovaResult, ScalePair } from './agreement.types';
import { iccOfPairs } from './icc';

/** Пара согласия с версией промпта первого (старого) разбора. */
export interface VersionAgreementPair extends AgreementPair {
    /** Версия промпта старого разбора; null — версий в записи не было. */
    firstPromptVersion: string | null;
}

/** Средний сдвиг шкалы «второй − первый» (новая − старая версия). */
export interface ScaleShift {
    code: string;
    /** Пар, где шкала оценена обоими разборами. */
    n: number;
    /** Средний сдвиг; null — пар нет. */
    meanShift: number | null;
}

/** Разбивка по старой версии промпта. */
export interface VersionAgreementBreakdown {
    /** Версия промпта старых разборов ('none' — версий не было). */
    promptVersion: string;
    pairs: number;
    /** ICC(2,1)/(3,1) по общему баллу; null — меньше двух пар. */
    icc: IccAnovaResult | null;
    /** sd разностей общего балла / √2; null — меньше двух пар. */
    sigma: number | null;
    /** Средний сдвиг общего балла «новая − старая». */
    meanShift: number | null;
    /** Средний сдвиг оценок разделов (шкалы с префиксом разделов). */
    sectionShifts: ScaleShift[];
}

/** Нагрузка записи `ai-analytics-version-agreement`. */
export interface VersionAgreementReport {
    /** Ключ записи: `${старая серия}->${текущая версия}`. */
    key: string;
    /** Дата серии старых разборов; 'none' — версий не было. */
    fromSeries: string;
    toPromptVersion: string;
    pairs: number;
    /** Общий отчёт согласия по всем парам (как у test-retest). */
    overall: GoldenReport;
    byOldPromptVersion: VersionAgreementBreakdown[];
}

export interface VersionAgreementInput {
    fromSeries: string | null;
    toPromptVersion: string;
    pairs: readonly VersionAgreementPair[];
    /** Код шкалы общего балла. */
    sigmaScale: string;
    /** Префикс шкал разделов рубрики. */
    sectionScalePrefix: string;
    quota?: number;
}

/** Значение разбивки для разборов без версий. */
export const VERSION_AGREEMENT_NO_VERSION = 'none' as const;

const mean = (values: readonly number[]): number | null =>
    values.length === 0
        ? null
        : values.reduce((sum, value) => sum + value, 0) / values.length;

/** Средний сдвиг «второй − первый» по шкале. */
export function scaleShiftOf(
    pairs: readonly AgreementPair[],
    code: string,
): ScaleShift {
    const values: ScalePair[] = scalePairsOf(pairs, code);
    return {
        code,
        n: values.length,
        meanShift: mean(values.map(pair => pair.second - pair.first)),
    };
}

/** Коды шкал разделов, встретившиеся хотя бы в одном разборе, по алфавиту. */
function sectionCodesOf(
    pairs: readonly AgreementPair[],
    prefix: string,
): string[] {
    const codes = new Set<string>();
    for (const pair of pairs) {
        for (const run of [pair.first, pair.second]) {
            Object.keys(run.scales)
                .filter(code => code.startsWith(prefix))
                .forEach(code => codes.add(code));
        }
    }
    return [...codes].sort((a, b) => a.localeCompare(b));
}

function breakdownOf(
    promptVersion: string,
    pairs: readonly AgreementPair[],
    input: VersionAgreementInput,
): VersionAgreementBreakdown {
    const score = scalePairsOf(pairs, input.sigmaScale);
    return {
        promptVersion,
        pairs: pairs.length,
        icc: iccOfPairs(score),
        sigma: sigmaOfPairs(score),
        meanShift: scaleShiftOf(pairs, input.sigmaScale).meanShift,
        sectionShifts: sectionCodesOf(pairs, input.sectionScalePrefix).map(
            code => scaleShiftOf(pairs, code),
        ),
    };
}

/**
 * Отчёт согласия версий: общий GoldenReport по всем парам плюс разбивка
 * по старой версии промпта (по алфавиту версий; разборы без версий —
 * группа 'none'). Нет пар — пустые разрезы, число пар 0.
 */
export function buildVersionAgreementReport(
    input: VersionAgreementInput,
): VersionAgreementReport {
    const fromSeries = input.fromSeries ?? VERSION_AGREEMENT_NO_VERSION;
    const key = `${fromSeries}->${input.toPromptVersion}`;
    const groups = new Map<string, VersionAgreementPair[]>();
    for (const pair of input.pairs) {
        const version = pair.firstPromptVersion ?? VERSION_AGREEMENT_NO_VERSION;
        const list = groups.get(version) ?? [];
        list.push(pair);
        groups.set(version, list);
    }
    return {
        key,
        fromSeries,
        toPromptVersion: input.toPromptVersion,
        pairs: input.pairs.length,
        overall: buildGoldenReport({
            promptVersion: key,
            pairs: input.pairs,
            sigmaScale: input.sigmaScale,
            ...(input.quota === undefined ? {} : { quota: input.quota }),
        }),
        byOldPromptVersion: [...groups.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([version, pairs]) => breakdownOf(version, pairs, input)),
    };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Структурная проверка нагрузки при чтении из ais. */
export function isVersionAgreementReportLike(
    value: unknown,
): value is VersionAgreementReport {
    if (!isRecord(value)) return false;
    return (
        typeof value.key === 'string' &&
        typeof value.fromSeries === 'string' &&
        typeof value.toPromptVersion === 'string' &&
        typeof value.pairs === 'number' &&
        isRecord(value.overall) &&
        Array.isArray(value.byOldPromptVersion)
    );
}
