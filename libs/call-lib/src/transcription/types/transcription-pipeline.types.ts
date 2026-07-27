/**
 * Типы автоконвейера AI-отчётности по звонкам (call-report).
 *
 * Автоконвейер — единственный писатель `dedup_key` ("{domain}:{activityId}"):
 * ручные транскрибации пишут NULL и не участвуют в дедупликации
 * (в БД легитимные дубликаты по (domain, activity_id) от повторных запусков).
 */

/** Статусы строки транскрибации, используемые конвейером. */
export const TRANSCRIPTION_PIPELINE_STATUSES = [
    'processing',
    'done',
    'error',
] as const;

export type TranscriptionPipelineStatus =
    (typeof TRANSCRIPTION_PIPELINE_STATUSES)[number];

/** Статусы, при которых звонок считается «занятым» и повторно не обрабатывается. */
export const TRANSCRIPTION_BUSY_STATUSES: TranscriptionPipelineStatus[] = [
    'processing',
    'done',
];

/** Единая конвенция entity_type для конвейера (см. call-report). */
export const CALL_REPORT_ENTITY_TYPE_DEAL = 'deal';
/** Звонок по лиду (активные продажи: до конвертации в сделку). */
export const CALL_REPORT_ENTITY_TYPE_LEAD = 'lead';
export type CallReportEntityType =
    | typeof CALL_REPORT_ENTITY_TYPE_DEAL
    | typeof CALL_REPORT_ENTITY_TYPE_LEAD;

/** Собирает ключ идемпотентности автоконвейера. */
export function buildDedupKey(
    domain: string,
    activityId: number | string,
): string {
    return `${domain}:${String(activityId)}`;
}

/** Данные для upsert строки при старте обработки звонка конвейером. */
export interface TranscriptionPipelineUpsertInput {
    dedupKey: string;
    domain: string;
    activityId: string;
    callId?: string;
    callStartedAt?: Date;
    entityType: string;
    entityId: string;
    userId?: string;
    durationSec?: number;
    app: string;
}

/** Данные завершения обработки (успех или ошибка). */
export interface TranscriptionPipelineUpdateInput {
    status: TranscriptionPipelineStatus;
    provider?: string;
    text?: string;
    symbolsCount?: string;
    durationSec?: number;
    /** Bitrix-id менеджера (ответственный сделки) — для фильтров отчётов. */
    userId?: string;
}

/** Представление строки транскрибации для конвейера и Agent API. */
export interface TranscriptionPipelineView {
    id: string;
    dedupKey: string | null;
    domain: string | null;
    activityId: string | null;
    callId: string | null;
    callStartedAt: Date | null;
    provider: string | null;
    status: string | null;
    text: string | null;
    durationSec: string | null;
    entityType: string | null;
    entityId: string | null;
    userId: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}
