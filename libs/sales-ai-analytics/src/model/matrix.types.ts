import type { AnalyticsCallLiteRow } from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import type { AiAnalyticsBucket } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/ai-analytics-event-map.const';
import { BucketScore } from './buckets';
import { MetricValue } from './metric';

/**
 * Булевы чек-листы презентации («Хвост», «5К»), если загрузчик их отдаёт.
 * Lite-строка call-lib их не несёт — тогда в ячейке поля undefined.
 */
export interface MatrixChecklistFlags {
    hvostDone?: boolean | null;
    fiveKDone?: boolean | null;
}

/** Входная строка матрицы: lite-строка звонка + необязательные чек-листы. */
export type MatrixCallRow = AnalyticsCallLiteRow & MatrixChecklistFlags;

/** Раздел рубрики за период: только relevance > 0, собственное n. */
export interface MatrixSectionAggregate {
    section: string;
    /** Среднее 1–10; null при n < scoreNone (честное «мало данных»). */
    avgScore: number | null;
    n: number;
    /** Средняя relevance 0–100 по оценённым звонкам. */
    avgRelevance: number;
}

/** Чек-листы ячейки, доли в процентах (Уилсон 90 %, ok при n ≥ 30). */
export interface MatrixChecklists {
    nextStepDateRatePct: MetricValue;
    hvostDonePct?: MetricValue;
    fiveKDonePct?: MetricValue;
}

/** Три опорных звонка ячейки по оценке (null — оценок нет). */
export interface EvidenceCallIds {
    best: string | null;
    worst: string | null;
    median: string | null;
}

/** Общая часть ячейки менеджер × тип и итога по типу. */
export interface MatrixCellCore {
    /** Разобранных сравнимых звонков (после всех фильтров). */
    n: number;
    /** Строк до comparableFrom (и без даты при заданном comparableFrom). */
    nBeforeComparable: number;
    /** Среднее weightedScore/10 (шкала 1–10) при n ≥ 8, иначе none. */
    score: MetricValue;
    /** Выборочное σ оценок (для ±интервала изменения); null при none. */
    scoreSd: number | null;
    sections: MatrixSectionAggregate[];
    checklists: MatrixChecklists;
    evidenceCallIds: EvidenceCallIds;
    /** В сравнимых строках ячейки больше одной сигнатуры versions. */
    versionsMixed: boolean;
}

export interface ManagerTypeCell extends MatrixCellCore {
    managerId: string;
    callType: string;
    bucket: AiAnalyticsBucket | null;
}

export interface TypeTotalsCell extends MatrixCellCore {
    callType: string;
    bucket: AiAnalyticsBucket | null;
    /** Сколько менеджеров имеют строки этого типа. */
    managers: number;
}

export interface ManagerMatrixRow {
    managerId: string;
    n: number;
    nBeforeComparable: number;
    /** Среднее по звонкам с корзиной (other / irrelevant не участвуют). */
    score: MetricValue;
    buckets: BucketScore[];
    byType: ManagerTypeCell[];
}

/** Почему строки не попали в ячейки. */
export interface MatrixExcluded {
    noAnalysis: number;
    noManager: number;
    noType: number;
    short: number;
    beforeComparable: number;
}

export interface ManagerTypeMatrix {
    /** По managerId по возрастанию. */
    managers: ManagerMatrixRow[];
    /** Итоги по типам в порядке справочника. */
    totals: TypeTotalsCell[];
    /** Корзины отдела. */
    buckets: BucketScore[];
    /** Разобранных сравнимых звонков всего. */
    analyzed: number;
    /** Из них без корзины (other / irrelevant / неизвестный тип). */
    noBucket: number;
    comparableFrom: string | null;
    excluded: MatrixExcluded;
}

export interface MatrixThresholds {
    /** Звонок короче — вне слоя качества (по умолчанию shortCallSec). */
    shortCallSec: number;
}

export interface MatrixOptions {
    thresholds?: Partial<MatrixThresholds>;
    /** Начало сравнимой истории YYYY-MM-DD (план §5.4). */
    comparableFrom?: string;
    /** TZ портала для сравнения даты звонка с comparableFrom. */
    timeZone?: string;
}
