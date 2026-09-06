/**
 * Сборка плоских строк аудита из строк БД. Доступ к БД абстрагирован
 * интерфейсом AuditDb (реализация на Prisma — ai-analytics-audit.db.ts),
 * поэтому сама сборка — чистые функции и тестируется без БД.
 */
import {
    AGENT_ANALYSIS_TYPE,
    CALL_CLASSIFY_TYPE,
} from '@lib/call-lib/ai/ai-record-types.const';
import { AuditCallRow } from './ai-analytics-audit.calc';
import {
    parseAnalysisFacts,
    parseClassifyCallType,
    parseDurationSec,
} from './ai-analytics-audit.parse';
import { monthKeyOf, windowLowerBound } from './ai-analytics-audit.time';

/** Типы ais-записей, нужные аудиту. */
export const AUDIT_AI_TYPES = [
    CALL_CLASSIFY_TYPE,
    AGENT_ANALYSIS_TYPE,
] as const;

/** Размер порции id для выборки ais (ограничение SQL IN). */
export const AI_BATCH_SIZE = 500;

export interface AuditTranscriptionRow {
    id: bigint;
    userId: string | null;
    /** Секунды строкой, как в БД. */
    duration: string | null;
    callStartedAt: Date | null;
    createdAt: Date | null;
}

export interface AuditAiRow {
    id: bigint;
    transcriptionId: bigint;
    type: string;
    result: string | null;
    userResult: unknown;
}

/** Глубина истории ais одного типа по домену. */
export interface AuditAiDepth {
    type: string;
    firstCreatedAt: Date | null;
    count: number;
}

export interface AuditDb {
    /** done-строки автоконвейера домена не раньше `from` (call_started_at, иначе created_at). */
    findDoneTranscriptions(
        domain: string,
        from: Date,
    ): Promise<AuditTranscriptionRow[]>;
    /** ais-записи типов AUDIT_AI_TYPES по id транскрипций, по возрастанию id. */
    findAiRecords(transcriptionIds: bigint[]): Promise<AuditAiRow[]>;
    aiDepth(domain: string, type: string): Promise<AuditAiDepth>;
}

export interface AuditLoadOptions {
    domain: string;
    /** Ключи месяцев окна YYYY-MM. */
    months: string[];
    timeZone: string;
}

export interface AuditDataset {
    rows: AuditCallRow[];
    depth: AuditAiDepth[];
    fetchedTranscriptions: number;
    /** Строки, чей месяц не попал в окно (запас нижней границы, нет даты). */
    outsideWindow: number;
}

/** Последняя по id запись каждого типа на транскрипцию. */
export function latestAiByTranscription(
    records: AuditAiRow[],
): Map<string, Map<string, AuditAiRow>> {
    const byTranscription = new Map<string, Map<string, AuditAiRow>>();
    for (const record of [...records].sort((a, b) => (a.id < b.id ? -1 : 1))) {
        const key = String(record.transcriptionId);
        const byType =
            byTranscription.get(key) ?? new Map<string, AuditAiRow>();
        byType.set(record.type, record);
        byTranscription.set(key, byType);
    }
    return byTranscription;
}

/** Плоская строка звонка; null — у транскрипции нет ни одной даты. */
export function buildAuditRow(
    transcription: AuditTranscriptionRow,
    aiByType: Map<string, AuditAiRow> | undefined,
    timeZone: string,
): AuditCallRow | null {
    const startedAt = transcription.callStartedAt ?? transcription.createdAt;
    if (!startedAt) return null;

    const analysis = aiByType?.get(AGENT_ANALYSIS_TYPE);
    const classify = aiByType?.get(CALL_CLASSIFY_TYPE);
    const facts = analysis ? parseAnalysisFacts(analysis.userResult) : null;
    const callType =
        facts?.callType ??
        (classify
            ? parseClassifyCallType(classify.userResult, classify.result)
            : null);

    return {
        transcriptionId: String(transcription.id),
        managerId: transcription.userId,
        month: monthKeyOf(startedAt, timeZone),
        durationSec: parseDurationSec(transcription.duration),
        callType,
        analysisPresent: analysis !== undefined,
        versionKey: facts?.versionKey ?? null,
        fields: facts?.fields ?? null,
    };
}

/** Строки окна из строк БД; строки вне окна и без даты считаются отдельно. */
export function buildAuditRows(
    transcriptions: AuditTranscriptionRow[],
    aiRecords: AuditAiRow[],
    options: AuditLoadOptions,
): Pick<AuditDataset, 'rows' | 'outsideWindow'> {
    const aiByTranscription = latestAiByTranscription(aiRecords);
    const months = new Set(options.months);
    const rows: AuditCallRow[] = [];
    let outsideWindow = 0;
    for (const transcription of transcriptions) {
        const row = buildAuditRow(
            transcription,
            aiByTranscription.get(String(transcription.id)),
            options.timeZone,
        );
        if (row && months.has(row.month)) {
            rows.push(row);
        } else {
            outsideWindow += 1;
        }
    }
    return { rows, outsideWindow };
}

async function loadAiRecordsInBatches(
    db: AuditDb,
    transcriptionIds: bigint[],
): Promise<AuditAiRow[]> {
    const records: AuditAiRow[] = [];
    for (let i = 0; i < transcriptionIds.length; i += AI_BATCH_SIZE) {
        const batch = transcriptionIds.slice(i, i + AI_BATCH_SIZE);
        records.push(...(await db.findAiRecords(batch)));
    }
    return records;
}

export async function loadAuditDataset(
    db: AuditDb,
    options: AuditLoadOptions,
): Promise<AuditDataset> {
    const from = windowLowerBound(options.months[0]);
    const transcriptions = await db.findDoneTranscriptions(
        options.domain,
        from,
    );
    const aiRecords = await loadAiRecordsInBatches(
        db,
        transcriptions.map(row => row.id),
    );
    const depth = await Promise.all(
        AUDIT_AI_TYPES.map(type => db.aiDepth(options.domain, type)),
    );
    return {
        ...buildAuditRows(transcriptions, aiRecords, options),
        depth,
        fetchedTranscriptions: transcriptions.length,
    };
}
