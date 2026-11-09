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
    /**
     * Доля выполненных обязательных пунктов методики, % (суммарно по
     * пунктам звонков ячейки с методикой); нет разборов с методикой — поля нет.
     */
    checkpointsDonePct?: MetricValue;
    /**
     * Доля звонков, где ограничитель срезал оценку, % — среди разборов с
     * данными методики (focus-v3.0 и новее); старых разборов нет — поля нет.
     */
    cappedCallsPct?: MetricValue;
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
    /**
     * Из n — строк до границы сравнимости: разбор старой версии (дата набора
     * versions раньше границы версий) или звонок раньше разрыва ряда
     * настройками; без версий — по дню звонка, без даты — сюда же. С
     * 09.11.2026 они входят в n и в оценки: это только пометка «часть
     * разборов — по прежним правилам».
     */
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
    /**
     * Среднее продвижение сделки по звонку, шкала 1–5 (разборы focus-v3.0 и
     * новее; типы без продвижения не считаются); при n < 8 — none. Нет ни
     * одного звонка с продвижением — поля нет.
     */
    dealProgress?: MetricValue;
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
    /** Из n — строк до границы сравнимости (входят в числа, пометка). */
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
    /**
     * Строк до границы сравнимости (версия разбора или разрыв настройками).
     * С 09.11.2026 они НЕ исключаются — входят в ячейки с пометкой
     * `nBeforeComparable`; счётчик остался под прежним именем ради витрины
     * (`meta.excludedBeforeComparable` показывает число помеченных).
     */
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
    /**
     * Из них без корзины — в оценки не входят (event_invite, other /
     * irrelevant, неизвестный тип).
     */
    noBucket: number;
    /**
     * Из них без своей колонки — доля «прочее» (other / irrelevant /
     * неизвестный тип); event_invite сюда не входит: у него своя колонка.
     */
    noColumn: number;
    /**
     * Действующая граница сравнимости: поздняя из границы версий и разрыва
     * ряда настройками; null — ни одна не задана.
     */
    comparableFrom: string | null;
    /** Граница по версии разбора (`comparableVersionFrom` / `comparableFrom`). */
    comparableVersionFrom: string | null;
    /** Разрыв ряда сменой настроек портала — по дню звонка. */
    seriesBreakFrom: string | null;
    excluded: MatrixExcluded;
}

export interface MatrixThresholds {
    /** Звонок короче — вне слоя качества (по умолчанию shortCallSec). */
    shortCallSec: number;
}

/**
 * Опции матрицы. Сравнимость (план §5.4) держится на ДВУХ разных
 * основаниях — версии разбора и разрыве ряда настройками портала, —
 * поэтому у них разные опции (правило — `model/comparable-row.ts`).
 */
export interface MatrixOptions {
    thresholds?: Partial<MatrixThresholds>;
    /**
     * Прежнее имя границы по ВЕРСИИ разбора 'YYYY-MM-DD' — синоним
     * `comparableVersionFrom` (при обоих главнее он). Вызывающим с одной
     * этой опцией строки без версий режутся по дню звонка, как раньше.
     */
    comparableFrom?: string;
    /**
     * Граница по ВЕРСИИ разбора 'YYYY-MM-DD' (обзор: max дат версий среди
     * разборов периода): строка сравнима, если дата её СОБСТВЕННОГО набора
     * versions не раньше границы, день звонка не участвует. Строка без
     * versions (или без дат в них) — по дню звонка в TZ портала.
     */
    comparableVersionFrom?: string;
    /**
     * Разрыв ряда сменой настроек портала 'YYYY-MM-DD' (события
     * `settings_break`, `ctx.comparableFrom` конвейера): звонок раньше этого
     * дня в TZ портала или без даты — до границы при любой версии разбора.
     */
    seriesBreakFrom?: string;
    /** TZ портала для дня звонка (разрыв ряда и строки без версий). */
    timeZone?: string;
}

/** Границы сравнимости из опций матрицы: пустая строка — границы нет. */
export interface MatrixComparability {
    /** Граница по версии разбора; null — не задана. */
    versionFrom: string | null;
    /** Разрыв ряда настройками (по дню звонка); null — не задан. */
    seriesBreakFrom: string | null;
    timeZone: string;
}
