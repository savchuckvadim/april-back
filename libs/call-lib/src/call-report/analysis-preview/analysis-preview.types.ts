/**
 * Проверка разбора на одном звонке без записи (задание focus-v3.4, проект
 * ai/tasks/2026-11-18-quotes-seconds-design.md, §10): общий контракт
 * админки (ставит задание и читает состояние) и воркера event-sales
 * (прогоняет фокус-разбор с цитатами и пишет итог).
 *
 * Разбор не сохраняется: ни записи ais, ни карточки в Битрикс24, оценки
 * звонка не меняются. Состояние живёт в Redis час.
 */
import {
    METHODOLOGY_PREVIEW_ID_PATTERN,
    METHODOLOGY_PREVIEW_STATUSES,
} from '../methodology/methodology-preview.types';

/** Сколько хранится состояние проверки, сек. */
export const ANALYSIS_PREVIEW_TTL_SEC = 3600;

/** Ключ состояния проверки в Redis. */
export const analysisPreviewKey = (previewId: string): string =>
    `call-report:analysis-preview:${previewId}`;

/** Номер проверки — uuid, как у проверки методики. */
export const ANALYSIS_PREVIEW_ID_PATTERN = METHODOLOGY_PREVIEW_ID_PATTERN;

/** Ход проверки — те же шаги, что у проверки методики. */
export const ANALYSIS_PREVIEW_STATUSES = METHODOLOGY_PREVIEW_STATUSES;
export type AnalysisPreviewStatus = (typeof ANALYSIS_PREVIEW_STATUSES)[number];

/** Данные задания проверки. */
export interface AnalysisPreviewJobData {
    previewId: string;
    domain: string;
    transcriptionId: string;
    requestedBy?: string;
    /**
     * Разобрать по частям, даже если разбор длинных разговоров по частям
     * выключен в настройках; не задано — решает настройка.
     */
    longParts?: boolean;
}

/** Виды мест разбора: раздел, потребность, пункт «хвоста», блок 5К. */
export const ANALYSIS_PREVIEW_POINT_KINDS = [
    'section',
    'need',
    'hvost',
    'five_k',
] as const;
export type AnalysisPreviewPointKind =
    (typeof ANALYSIS_PREVIEW_POINT_KINDS)[number];

/** Место разбора в разговоре: что модель привела и где. */
export interface AnalysisPreviewPoint {
    kind: AnalysisPreviewPointKind;
    /** Название раздела, потребность или пункт чек-листа. */
    title: string;
    /** Дословная цитата модели; null — модель её не привела. */
    quote: string | null;
    /** Секунда в записи после приёма разбора; null — места нет. */
    startSec: number | null;
}

/** Сколько мест одного вида и у скольких есть секунда в записи. */
export interface AnalysisPreviewCoverage {
    kind: AnalysisPreviewPointKind;
    total: number;
    withTime: number;
}

/** Оценка раздела: действующий разбор и проверочный. */
export interface AnalysisPreviewSectionScore {
    section: string;
    title: string;
    before: number | null;
    after: number | null;
}

/** Как шёл разбор длинного разговора по частям. */
export interface AnalysisPreviewLongCall {
    /** На сколько частей разрезали расшифровку. */
    parts: number;
    /** Сколько частей остались без конспекта. */
    partsWithoutDigest: number;
    /** Удалось ли свести разговор в одну сводку. */
    hasSummary: boolean;
    /** Знаков в расшифровке после уплотнения коротких строк. */
    transcriptChars: number;
    /**
     * Знаков в расшифровке до уплотнения. Нет поля — разбор сделан до этой
     * доработки.
     */
    sourceChars?: number;
}

/** Итог проверки разбора на звонке. */
export interface AnalysisPreviewResult {
    /** Версия задания, с которым шёл проверочный разбор. */
    promptVersion: string;
    /** Тип звонка, с которым шёл разбор; null — не определён. */
    callType: string | null;
    /** Длительность записи, сек; null — неизвестна. */
    durationSec: number | null;
    /** Итоговая оценка: действующий разбор → проверочный. */
    scoreBefore: number | null;
    scoreAfter: number | null;
    sections: AnalysisPreviewSectionScore[];
    points: AnalysisPreviewPoint[];
    coverage: AnalysisPreviewCoverage[];
    /** Части разбора, которые не собрались; пусто — разбор полный. */
    incompleteParts: string[];
    /** Токены всех вызовов проверки; null — поставщик не сообщил. */
    tokens: number | null;
    /**
     * Разбор по частям: сведения о резке; null — разбор шёл по полной
     * расшифровке. Нет поля — состояние записано до появления блока.
     */
    longCall?: AnalysisPreviewLongCall | null;
}

/** Состояние проверки в Redis — ответ админки на опрос. */
export interface AnalysisPreviewState {
    previewId: string;
    status: AnalysisPreviewStatus;
    domain: string;
    transcriptionId: string;
    /** Причина отказа словами; null — ошибки нет. */
    error: string | null;
    result: AnalysisPreviewResult | null;
    /** Момент последнего изменения, ISO. */
    updatedAt: string;
}

/** Начальное состояние: задание поставлено, воркер ещё не взял. */
export const queuedAnalysisPreview = (
    data: Pick<
        AnalysisPreviewJobData,
        'previewId' | 'domain' | 'transcriptionId'
    >,
    now: Date,
): AnalysisPreviewState => ({
    previewId: data.previewId,
    status: 'queued',
    domain: data.domain,
    transcriptionId: data.transcriptionId,
    error: null,
    result: null,
    updatedAt: now.toISOString(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Состояние из строки Redis; чужая форма или битый JSON — null. */
export function parseAnalysisPreviewState(
    raw: string | null,
): AnalysisPreviewState | null {
    if (!raw) return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (
            !isRecord(value) ||
            typeof value.previewId !== 'string' ||
            typeof value.status !== 'string' ||
            !(ANALYSIS_PREVIEW_STATUSES as readonly string[]).includes(
                value.status,
            )
        ) {
            return null;
        }
        return value as unknown as AnalysisPreviewState;
    } catch {
        return null;
    }
}
