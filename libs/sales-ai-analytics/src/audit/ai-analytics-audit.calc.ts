/**
 * Чистые функции агрегации для аудита данных AI-аналитики ОП
 * (Фаза 0 плана ai/tasks/ai-sales-analytics-plan.md).
 *
 * Без Prisma и Nest: на вход — плоские строки звонков (см. AuditCallRow),
 * на выход — таблицы для markdown-отчёта.
 */
import {
    CALL_REPORT_CALL_TYPE_CODES,
    CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';

/** Ключ для строк без менеджера / без типа / без версии. */
export const UNKNOWN_KEY = 'unknown';

/** Ключ типа в ячейках, свёрнутых по всем типам (менеджер × месяц). */
export const ALL_TYPES_KEY = 'all';

/** Типы-«шум», доля которых считается по месяцам. */
export const NOISE_CALL_TYPES = [
    'other',
    'irrelevant',
] as const satisfies readonly CallReportCallTypeCode[];
export type NoiseCallType = (typeof NOISE_CALL_TYPES)[number];

/** Наличие полей user_result глубокого разбора (счётчики по одному звонку). */
export interface AuditAnalysisFields {
    nextStepSet: boolean;
    nextStepDate: boolean;
    sectionsTotal: number;
    sectionsWithAlternatives: number;
    objectionsTotal: number;
    objectionsWithQuote: number;
}

/** Плоская строка звонка для аудита (текст транскрипта не нужен). */
export interface AuditCallRow {
    transcriptionId: string;
    managerId: string | null;
    /** Месяц звонка YYYY-MM (по call_started_at, иначе created_at). */
    month: string;
    durationSec: number | null;
    /** Итоговый тип: agent-analysis.callType, иначе call-classify. */
    callType: string | null;
    /** Есть ли глубокий разбор (ais type=agent-analysis). */
    analysisPresent: boolean;
    /** Ключ версии разбора (versions → agentVersion → null). */
    versionKey: string | null;
    /** Поля user_result (только при analysisPresent). */
    fields: AuditAnalysisFields | null;
}

export interface ManagerCoverageRow {
    month: string;
    total: number;
    withManager: number;
    withManagerPct: number | null;
    analyzed: number;
    analyzedWithManager: number;
}

/** Ячейка «менеджер × тип × месяц» с числом разборов. */
export interface AnalysisCell {
    month: string;
    managerId: string;
    callType: string;
    n: number;
}

/** Сводная таблица одного месяца: строки — менеджеры, колонки — типы. */
export interface MonthPivot {
    month: string;
    /** Типы, встретившиеся в месяце: канонический порядок, unknown в конце. */
    typeOrder: string[];
    managers: {
        managerId: string;
        byType: Record<string, number>;
        total: number;
    }[];
    /** Доля разборов месяца в ячейках (менеджер × тип) с n ≥ minN. */
    inCellsWithMinNPct: number | null;
}

export interface NoiseShareRow {
    month: string;
    total: number;
    typed: number;
    byType: Record<NoiseCallType, { n: number; pct: number | null }>;
}

export interface DurationStats {
    n: number;
    missing: number;
    p10: number | null;
    p50: number | null;
    p90: number | null;
    shortCount: number;
    shortPct: number | null;
}

export interface VersionRow {
    month: string;
    versionKey: string;
    n: number;
}

export interface FieldPresence {
    analyzed: number;
    nextStep: {
        set: number;
        withDate: number;
        withDatePctOfAnalyzed: number | null;
        withDatePctOfSet: number | null;
    };
    sections: {
        callsWithAny: number;
        callsWithAnyPct: number | null;
        total: number;
        withAlternatives: number;
        withAlternativesPct: number | null;
    };
    objections: {
        callsWithObjections: number;
        total: number;
        withQuote: number;
        withQuotePct: number | null;
    };
}

export function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

/** Доля в процентах с одним знаком; null при пустом знаменателе. */
export function pct(part: number, total: number): number | null {
    return total > 0 ? round1((part / total) * 100) : null;
}

/** Квантиль с линейной интерполяцией (R type 7); null для пустого ряда. */
export function quantile(values: number[], p: number): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * p;
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, sorted.length - 1);
    const fraction = position - lower;
    return round1(sorted[lower] + (sorted[upper] - sorted[lower]) * fraction);
}

function sortedMonths(rows: { month: string }[]): string[] {
    return [...new Set(rows.map(row => row.month))].sort();
}

export function managerCoverageByMonth(
    rows: AuditCallRow[],
): ManagerCoverageRow[] {
    return sortedMonths(rows).map(month => {
        const inMonth = rows.filter(row => row.month === month);
        const withManager = inMonth.filter(row => row.managerId !== null);
        const analyzed = inMonth.filter(row => row.analysisPresent);
        return {
            month,
            total: inMonth.length,
            withManager: withManager.length,
            withManagerPct: pct(withManager.length, inMonth.length),
            analyzed: analyzed.length,
            analyzedWithManager: analyzed.filter(row => row.managerId !== null)
                .length,
        };
    });
}

function sortCells(cells: AnalysisCell[]): AnalysisCell[] {
    return cells.sort(
        (a, b) =>
            a.month.localeCompare(b.month) ||
            a.managerId.localeCompare(b.managerId) ||
            a.callType.localeCompare(b.callType),
    );
}

/** Число разборов по ячейкам (менеджер × тип × месяц), только analysisPresent. */
export function analysisCells(rows: AuditCallRow[]): AnalysisCell[] {
    const counts = new Map<string, AnalysisCell>();
    for (const row of rows) {
        if (!row.analysisPresent) continue;
        const managerId = row.managerId ?? UNKNOWN_KEY;
        const callType = row.callType ?? UNKNOWN_KEY;
        const key = `${row.month}|${managerId}|${callType}`;
        const cell = counts.get(key) ?? {
            month: row.month,
            managerId,
            callType,
            n: 0,
        };
        cell.n += 1;
        counts.set(key, cell);
    }
    return sortCells([...counts.values()]);
}

/** Свёртка ячеек по типам: одна ячейка на (менеджер × месяц). */
export function collapseCellsByManagerMonth(
    cells: AnalysisCell[],
): AnalysisCell[] {
    const counts = new Map<string, AnalysisCell>();
    for (const cell of cells) {
        const key = `${cell.month}|${cell.managerId}`;
        const collapsed = counts.get(key) ?? {
            month: cell.month,
            managerId: cell.managerId,
            callType: ALL_TYPES_KEY,
            n: 0,
        };
        collapsed.n += cell.n;
        counts.set(key, collapsed);
    }
    return sortCells([...counts.values()]);
}

/** Доля разборов (в %), попавших в ячейки с n ≥ minN. */
export function analyzedShareInCellsWithMinN(
    cells: AnalysisCell[],
    minN: number,
): number | null {
    const total = cells.reduce((sum, cell) => sum + cell.n, 0);
    const covered = cells
        .filter(cell => cell.n >= minN)
        .reduce((sum, cell) => sum + cell.n, 0);
    return pct(covered, total);
}

/** Порядок колонок месяца: канонические коды, затем прочие, unknown в конце. */
function presentTypeOrder(
    cells: AnalysisCell[],
    typeCodes: readonly string[],
): string[] {
    const present = new Set(cells.map(cell => cell.callType));
    const canonical = typeCodes.filter(code => present.has(code));
    const extra = [...present]
        .filter(type => !typeCodes.includes(type) && type !== UNKNOWN_KEY)
        .sort();
    const unknown = present.has(UNKNOWN_KEY) ? [UNKNOWN_KEY] : [];
    return [...canonical, ...extra, ...unknown];
}

/** Сводные таблицы по месяцам из ячеек (менеджер × тип × месяц). */
export function pivotCellsByMonth(
    cells: AnalysisCell[],
    minN: number,
    typeCodes: readonly string[] = CALL_REPORT_CALL_TYPE_CODES,
): MonthPivot[] {
    return sortedMonths(cells).map(month => {
        const inMonth = cells.filter(cell => cell.month === month);
        const managerIds = [
            ...new Set(inMonth.map(cell => cell.managerId)),
        ].sort();
        const managers = managerIds.map(managerId => {
            const byType: Record<string, number> = {};
            let total = 0;
            for (const cell of inMonth) {
                if (cell.managerId !== managerId) continue;
                byType[cell.callType] = (byType[cell.callType] ?? 0) + cell.n;
                total += cell.n;
            }
            return { managerId, byType, total };
        });
        return {
            month,
            typeOrder: presentTypeOrder(inMonth, typeCodes),
            managers,
            inCellsWithMinNPct: analyzedShareInCellsWithMinN(inMonth, minN),
        };
    });
}

/** Доля other/irrelevant среди звонков с известным типом по месяцам. */
export function noiseShareByMonth(rows: AuditCallRow[]): NoiseShareRow[] {
    return sortedMonths(rows).map(month => {
        const inMonth = rows.filter(row => row.month === month);
        const typed = inMonth.filter(row => row.callType !== null).length;
        const byType = {} as NoiseShareRow['byType'];
        for (const type of NOISE_CALL_TYPES) {
            const n = inMonth.filter(row => row.callType === type).length;
            byType[type] = { n, pct: pct(n, typed) };
        }
        return { month, total: inMonth.length, typed, byType };
    });
}

export function durationStats(
    rows: AuditCallRow[],
    shortCallSec: number,
): DurationStats {
    const values = rows
        .map(row => row.durationSec)
        .filter((value): value is number => value !== null);
    const shortCount = values.filter(value => value < shortCallSec).length;
    return {
        n: values.length,
        missing: rows.length - values.length,
        p10: quantile(values, 0.1),
        p50: quantile(values, 0.5),
        p90: quantile(values, 0.9),
        shortCount,
        shortPct: pct(shortCount, values.length),
    };
}

export function durationStatsByMonth(
    rows: AuditCallRow[],
    shortCallSec: number,
): (DurationStats & { month: string })[] {
    return sortedMonths(rows).map(month => ({
        month,
        ...durationStats(
            rows.filter(row => row.month === month),
            shortCallSec,
        ),
    }));
}

/** Разборы по ключу версии и месяцу (только analysisPresent). */
export function versionsByMonth(rows: AuditCallRow[]): VersionRow[] {
    const counts = new Map<string, VersionRow>();
    for (const row of rows) {
        if (!row.analysisPresent) continue;
        const versionKey = row.versionKey ?? UNKNOWN_KEY;
        const key = `${row.month}|${versionKey}`;
        const entry = counts.get(key) ?? { month: row.month, versionKey, n: 0 };
        entry.n += 1;
        counts.set(key, entry);
    }
    return [...counts.values()].sort(
        (a, b) =>
            a.month.localeCompare(b.month) ||
            a.versionKey.localeCompare(b.versionKey),
    );
}

/** Заполненность nextStep.date, sections[].alternatives, objections[].quote. */
export function fieldPresence(rows: AuditCallRow[]): FieldPresence {
    const fields = rows
        .map(row => row.fields)
        .filter((value): value is AuditAnalysisFields => value !== null);
    const sum = (pick: (item: AuditAnalysisFields) => number): number =>
        fields.reduce((total, item) => total + pick(item), 0);
    const analyzed = fields.length;
    const nextStepSet = fields.filter(item => item.nextStepSet).length;
    const nextStepDate = fields.filter(item => item.nextStepDate).length;
    const callsWithAny = fields.filter(
        item => item.sectionsWithAlternatives > 0,
    ).length;
    const sectionsTotal = sum(item => item.sectionsTotal);
    const sectionsWithAlternatives = sum(item => item.sectionsWithAlternatives);
    const objectionsTotal = sum(item => item.objectionsTotal);
    const objectionsWithQuote = sum(item => item.objectionsWithQuote);
    return {
        analyzed,
        nextStep: {
            set: nextStepSet,
            withDate: nextStepDate,
            withDatePctOfAnalyzed: pct(nextStepDate, analyzed),
            withDatePctOfSet: pct(nextStepDate, nextStepSet),
        },
        sections: {
            callsWithAny,
            callsWithAnyPct: pct(callsWithAny, analyzed),
            total: sectionsTotal,
            withAlternatives: sectionsWithAlternatives,
            withAlternativesPct: pct(sectionsWithAlternatives, sectionsTotal),
        },
        objections: {
            callsWithObjections: fields.filter(item => item.objectionsTotal > 0)
                .length,
            total: objectionsTotal,
            withQuote: objectionsWithQuote,
            withQuotePct: pct(objectionsWithQuote, objectionsTotal),
        },
    };
}
