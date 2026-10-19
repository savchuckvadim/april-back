/**
 * Выбор АКТИВНОЙ записи ais среди записей одного звонка (переразбор
 * истории, ai/tasks/2026-10-19-ai-focus-plan.md, этап 1B).
 *
 * После переразбора у транскрипции несколько записей `agent-analysis`:
 * старая со статусом `superseded` (нагрузка сохранена) и новая активная.
 * Читатели не должны брать «первую попавшуюся» — порядок выборки не
 * определён. Правило одно для всех: активная = status ≠ superseded; при
 * нескольких активных — с наибольшим числовым id. Чистые функции без DI.
 */
import { AGENT_ANALYSIS_TYPE } from '../ai-record-types.const';

/** Статус замещённой записи: у звонка есть более новая активная запись. */
export const AI_RECORD_SUPERSEDED_STATUS = 'superseded' as const;

/** Минимум записи ais, нужный выбору активной. */
export interface AiActiveRecordView {
    id: string;
    status?: string | null;
    type?: string | null;
    transcription_id?: string | null;
}

export function isSupersededRecord(record: {
    status?: string | null;
}): boolean {
    return record.status === AI_RECORD_SUPERSEDED_STATUS;
}

/** Сравнение id как чисел (десятичные строки bigint); нечисловые — как строки. */
function isNewer(candidate: string, current: string): boolean {
    const a = Number(candidate);
    const b = Number(current);
    if (Number.isFinite(a) && Number.isFinite(b)) return a > b;
    return candidate > current;
}

/**
 * Активная запись: status ≠ superseded, при нескольких — с наибольшим id.
 * Нет ни одной активной — null (замещённые без преемника не отдаются).
 */
export function pickActiveRecord<T extends AiActiveRecordView>(
    records: readonly T[],
): T | null {
    let active: T | null = null;
    for (const record of records) {
        if (isSupersededRecord(record)) continue;
        if (active === null || isNewer(record.id, active.id)) {
            active = record;
        }
    }
    return active;
}

/** Активная запись заданного типа (по умолчанию — глубокий разбор). */
export function pickActiveAnalysis<T extends AiActiveRecordView>(
    records: readonly T[],
    type: string = AGENT_ANALYSIS_TYPE,
): T | null {
    return pickActiveRecord(records.filter(record => record.type === type));
}

/** Активные записи типа по транскрипциям; записи без транскрипции пропускаются. */
export function activeAnalysisByTranscription<T extends AiActiveRecordView>(
    records: readonly T[],
    type: string = AGENT_ANALYSIS_TYPE,
): Map<string, T> {
    const grouped = new Map<string, T[]>();
    for (const record of records) {
        if (record.type !== type) continue;
        const key = record.transcription_id
            ? String(record.transcription_id)
            : '';
        if (!key) continue;
        const list = grouped.get(key) ?? [];
        list.push(record);
        grouped.set(key, list);
    }
    const active = new Map<string, T>();
    for (const [key, list] of grouped) {
        const record = pickActiveRecord(list);
        if (record !== null) active.set(key, record);
    }
    return active;
}
