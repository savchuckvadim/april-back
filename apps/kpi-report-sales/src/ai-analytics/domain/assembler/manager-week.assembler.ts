/**
 * Недельный снапшот менеджера (`ai-analytics-manager-week`, план §3.1,
 * поток 14b): из разборов недели собираются объём, оценки по корзинам и
 * типам, разделы рубрики, чек-листы, возражения, версии разбора и следы
 * правил портала.
 *
 * Что нельзя ломать:
 * - неделя БЕЗ разборов записи не создаёт — пустая строка в ряду хуже,
 *   чем её отсутствие: тренд Фазы 3 принял бы её за провал;
 * - звонки ДО `comparableFrom` в оценки не смешиваются и считаются
 *   отдельно (`nBeforeComparable`) — иначе смена рубрики выглядит
 *   изменением работы менеджера;
 * - потолки оценивания применяются ДО сборки матрицы, иначе в снапшот
 *   уедет балл, который руководитель уже отменил правилом;
 * - неприменимые к типу разделы рубрики вычёркиваются ПЕРЕД потолками:
 *   раздела, которого в таком разговоре быть не должно, не касаются ни
 *   правила портала, ни знаменатель оценки;
 * - порог «разбираемого» звонка — КАРТА по типам (единый порог портала,
 *   тот же, что у пульса), а не один скаляр: при разных порогах по типам
 *   скаляр уводил конвейер на дефолт 300 с (аудит Фазы 2, M2);
 * - неделя без разборов пишется маркером ПОРТАЛЬНОГО зерна
 *   (`managerId: null`, `empty: true`): без него догон истории считал бы
 *   пустую неделю дырой каждую ночь (M3); строк менеджеров у неё нет.
 *
 * Чистая детерминированная функция: без DI, Bitrix и `new Date()`.
 */
import {
    buildManagerTypeMatrix,
    buildObjectionsSlice,
    type AiScoringSettings,
    type AnalysisVersions,
    type ManagerTypeMatrixOptions,
    type MinDurationSecByType,
    type ObjectionCategoryStat,
    type ScoringCapSkipped,
} from '@lib/sales-ai-analytics';
import {
    AI_MANAGER_SNAPSHOT_REASONS,
    type AiManagerSnapshotReason,
} from '../../constants/ai-manager-snapshot.const';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import { toMatrixRow } from './manager-type-matrix.assembler';
import {
    versionsKey,
    type AiSnapshotMeta,
    type ManagerSnapshotRow,
    type ManagerWeekPayload,
} from './manager-snapshot.types';
import { applyPeriodScoring, traceOf } from './period-scoring.util';
import {
    applicabilityTraceOf,
    applySectionApplicability,
} from './section-applicability.util';

export interface ManagerWeekInput {
    /** ISO-неделя снапшота 'YYYY-Www'. */
    weekKey: string;
    /** Разборы недели (уже отфильтрованы окном недели в TZ портала). */
    rows: readonly DatedLiteRow[];
    /** Правила портала: потолки оценивания и стоп-фразы. */
    scoring: AiScoringSettings;
    /**
     * Порог «разбираемого» звонка по типам (`portalMinDurationByType`);
     * нет — дефолт матрицы 300 с для всех типов.
     */
    minDurationSecByType?: MinDurationSecByType;
    /** Начало сравнимой истории 'YYYY-MM-DD'; null — ряд не рвался. */
    comparableFrom: string | null;
    /** TZ портала: по ней день звонка сравнивается с `comparableFrom`. */
    timeZone: string;
    meta: AiSnapshotMeta;
}

/** Общие для недели и месяца опции матрицы: порог, граница, TZ. */
export type PeriodMatrixInput = Pick<
    ManagerWeekInput,
    'minDurationSecByType' | 'comparableFrom' | 'timeZone'
>;

/**
 * Опции матрицы периода: карта порогов и граница сравнимости кладутся,
 * только если заданы, — опции без ключа означают «дефолт библиотеки».
 * Неделя и месяц обязаны строить матрицу одними опциями.
 */
export function periodMatrixOptions(
    input: PeriodMatrixInput,
): ManagerTypeMatrixOptions {
    return {
        ...(input.minDurationSecByType === undefined
            ? {}
            : { minDurationSecByType: input.minDurationSecByType }),
        ...(input.comparableFrom === null
            ? {}
            : { comparableFrom: input.comparableFrom }),
        timeZone: input.timeZone,
    };
}

/**
 * Маркер недели без разборов — запись `ai-analytics-manager-week`
 * портального зерна (`managerId: null`). Читатели рядов менеджеров обязаны
 * фильтровать по `managerId`; догон истории считает такую неделю
 * обработанной.
 */
export interface ManagerWeekEmptyPayload {
    empty: true;
    n: 0;
    reason: AiManagerSnapshotReason;
    meta: AiSnapshotMeta;
}

export function emptyWeekPayload(
    meta: AiSnapshotMeta,
): ManagerWeekEmptyPayload {
    return {
        empty: true,
        n: 0,
        reason: AI_MANAGER_SNAPSHOT_REASONS.weekNoAnalysis,
        meta,
    };
}

export interface ManagerWeekAssembly {
    weekKey: string;
    /** По менеджеру с разборами недели; без разборов строки нет. */
    rows: ManagerSnapshotRow<ManagerWeekPayload>[];
    /** Правила, не применившиеся ни к одному разбору, с причиной. */
    capsSkipped: ScoringCapSkipped[];
    /** Разборов недели после потолков (для журнала прогона). */
    analyzed: number;
}

/** Сравнимая строка менеджера с известными версиями разбора. */
function comparableVersions(
    rows: readonly DatedLiteRow[],
    managerId: string,
): { versions: AnalysisVersions | null; mixed: boolean } {
    const signatures = new Map<string, AnalysisVersions>();
    for (const row of rows) {
        if (row.managerId !== managerId || !row.analysisPresent) continue;
        const versions = toAnalysisVersions(row.versions);
        if (versions === null) continue;
        signatures.set(versionsKey(versions), versions);
    }
    const found = [...signatures.values()];
    return { versions: found[0] ?? null, mixed: found.length > 1 };
}

/** Карта версий разбора → контракт AnalysisVersions; неполная — null. */
export function toAnalysisVersions(
    versions: Record<string, string> | null,
): AnalysisVersions | null {
    if (versions === null) return null;
    const { prompt, rubric, registry, attribution, classifier } = versions;
    const values = [prompt, rubric, registry, attribution, classifier];
    return values.every(value => typeof value === 'string' && value !== '')
        ? { prompt, rubric, registry, attribution, classifier }
        : null;
}

/** Возражения менеджера за неделю по категориям; нет — пустой список. */
function objectionsOf(
    slices: readonly {
        managerId: string;
        byCategory: ObjectionCategoryStat[];
    }[],
    managerId: string,
): ObjectionCategoryStat[] {
    return (
        slices.find(slice => slice.managerId === managerId)?.byCategory ?? []
    );
}

/**
 * Нагрузки недельного снапшота по менеджерам. Строка появляется только у
 * менеджеров, у которых на неделе есть разборы (сравнимые либо до границы
 * сравнимости): «неделя без разборов записи не создаёт».
 */
export function buildManagerWeekPayload(
    input: ManagerWeekInput,
): ManagerWeekAssembly {
    const applicable = applySectionApplicability(input.rows);
    const scoring = applyPeriodScoring(applicable.rows, input.scoring);
    const matrixOptions = periodMatrixOptions(input);
    const matrix = buildManagerTypeMatrix(
        scoring.rows.map(toMatrixRow),
        matrixOptions,
    );
    const objections = buildObjectionsSlice(scoring.rows, {
        ...(matrixOptions.minDurationSecByType === undefined
            ? {}
            : { minDurationSecByType: matrixOptions.minDurationSecByType }),
    });
    const rows = matrix.managers.map(manager => {
        const trace = traceOf(scoring, manager.managerId);
        const versions = comparableVersions(scoring.rows, manager.managerId);
        const payload: ManagerWeekPayload = {
            n: manager.n,
            nBeforeComparable: manager.nBeforeComparable,
            score: manager.score,
            buckets: manager.buckets,
            byType: manager.byType,
            objections: objectionsOf(objections.byManager, manager.managerId),
            versions: versions.versions,
            versionsMixed:
                versions.mixed ||
                manager.byType.some(cell => cell.versionsMixed),
            comparableFrom: input.comparableFrom,
            caps: trace.caps,
            flags: trace.flags,
            stopWords: trace.stopWords,
            applicability: applicabilityTraceOf(applicable, manager.managerId),
            meta: input.meta,
        };
        return { managerId: manager.managerId, payload };
    });
    return {
        weekKey: input.weekKey,
        rows,
        capsSkipped: scoring.skipped,
        analyzed: matrix.analyzed,
    };
}
