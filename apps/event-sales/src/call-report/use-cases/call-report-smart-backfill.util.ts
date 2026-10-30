/**
 * Чистые помощники дописывания полей карточек разборов (джоба
 * CALL_REPORT_SMART_BACKFILL): отбор кандидатов из лёгких записей ais,
 * статус части и итог джобы. Окно дат — те же правила, что у переразбора
 * (`windowBounds` / `dayKeyInWindow`).
 *
 * Без DI, Bitrix и `new Date()`.
 */
import {
    pickActiveRecord,
    type AiSmartWriteCandidateView,
} from '@lib/call-lib';
import {
    emptySmartBackfillSkips,
    type SmartBackfillJobData,
    type SmartBackfillRunStatus,
    type SmartBackfillSkipReason,
} from '@lib/sales-ai-analytics';
import { dayKeyInWindow } from './call-report-reanalyze.util';

/** Запись, которую будем переписывать в элемент смарта. */
export interface SmartBackfillCandidate {
    id: string;
    transcriptionId: string | null;
    reportItemId: string;
}

export interface SmartBackfillSelection {
    candidates: SmartBackfillCandidate[];
    skippedBy: Record<SmartBackfillSkipReason, number>;
}

/** Итог части джобы (ответ процессора, попадает в лог Bull). */
export interface CallReportSmartBackfillResult {
    domain: string;
    mode: SmartBackfillRunStatus['mode'];
    from: string;
    to: string;
    part: number;
    dryRun: boolean;
    candidates: number;
    /** Обработано в этой части (успех + сбой + пропуск по форме). */
    processed: number;
    done: number;
    failed: number;
    missing: number;
    skipped: number;
    continuedWith: string | null;
    statusId: string;
    elapsedMs: number;
}

/**
 * Отбор: записи окна по дню записи в поясе портала; на транскрипцию — одна
 * активная запись (замещённые переразбором — пропуск `superseded`); без
 * элемента смарта — пропуск `noSmartItem`. Порядок — по id, как в выборке:
 * на нём держится смещение продолжений режима `period`.
 */
export function selectSmartBackfillCandidates(
    records: readonly AiSmartWriteCandidateView[],
    window: { from: string; to: string; timeZone: string },
): SmartBackfillSelection {
    const skippedBy = emptySmartBackfillSkips();
    const inWindow = records.filter(record =>
        dayKeyInWindow(
            record.created_at,
            window.from,
            window.to,
            window.timeZone,
        ),
    );
    const grouped = new Map<string, AiSmartWriteCandidateView[]>();
    for (const record of inWindow) {
        const key = record.transcription_id
            ? `t:${record.transcription_id}`
            : `id:${record.id}`;
        const list = grouped.get(key) ?? [];
        list.push(record);
        grouped.set(key, list);
    }
    const candidates: SmartBackfillCandidate[] = [];
    for (const list of grouped.values()) {
        const active = pickActiveRecord(list);
        skippedBy.superseded += list.length - (active ? 1 : 0);
        if (!active) continue;
        if (!active.report_item_id) {
            skippedBy.noSmartItem += 1;
            continue;
        }
        candidates.push({
            id: active.id,
            transcriptionId: active.transcription_id,
            reportItemId: active.report_item_id,
        });
    }
    candidates.sort((a, b) => Number(a.id) - Number(b.id));
    return { candidates, skippedBy };
}

/** Сколько пропущено на отборе — сумма причин. */
export function skippedTotal(
    skippedBy: Record<SmartBackfillSkipReason, number>,
): number {
    return Object.values(skippedBy).reduce((sum, count) => sum + count, 0);
}

/**
 * Статус части. Часть > 1 продолжает незаконченный боевой прогон того же
 * ключа: счётчики переносятся, иначе начинается заново.
 */
export function initialSmartBackfillStatus(input: {
    data: SmartBackfillJobData;
    selection: SmartBackfillSelection;
    previous: SmartBackfillRunStatus | null;
    now: Date;
}): SmartBackfillRunStatus {
    const { data, selection, previous, now } = input;
    const part = data.part ?? 1;
    const carry =
        part > 1 &&
        previous !== null &&
        !previous.finished &&
        !previous.dryRun &&
        previous.mode === data.mode;
    const iso = now.toISOString();
    return {
        domain: data.domain,
        mode: data.mode,
        from: data.from,
        to: data.to,
        dryRun: data.dryRun === true,
        source: data.source,
        part,
        candidates: carry
            ? previous.candidates
            : selection.candidates.length + skippedTotal(selection.skippedBy),
        done: carry ? previous.done : 0,
        failed: carry ? previous.failed : 0,
        missing: carry ? previous.missing : 0,
        skipped: carry ? previous.skipped : skippedTotal(selection.skippedBy),
        skippedBy: carry ? previous.skippedBy : selection.skippedBy,
        startedAt: carry ? previous.startedAt : iso,
        updatedAt: iso,
        finished: false,
        lastError: carry ? previous.lastError : null,
        timeBudgetHit: false,
        continuedWith: null,
    };
}

export function toSmartBackfillResult(
    status: SmartBackfillRunStatus,
    processed: number,
    statusId: string,
    startedAt: number,
): CallReportSmartBackfillResult {
    return {
        domain: status.domain,
        mode: status.mode,
        from: status.from,
        to: status.to,
        part: status.part,
        dryRun: status.dryRun,
        candidates: status.candidates,
        processed,
        done: status.done,
        failed: status.failed,
        missing: status.missing,
        skipped: status.skipped,
        continuedWith: status.continuedWith,
        statusId,
        elapsedMs: Date.now() - startedAt,
    };
}
