/**
 * Чистые помощники переразбора истории (план 2026-10-19-ai-focus-plan.md,
 * этап 1B): окно дат портала, отбор кандидатов по сериям версий, статус
 * части и итог джобы. Сборка записи, оценка стоимости и пары отчёта —
 * `call-report-reanalyze.record.ts`.
 *
 * Без DI, Bitrix и `new Date()`.
 */
import { AGENT_ANALYSIS_TYPE, pickActiveAnalysis } from '@lib/call-lib';
import {
    dateKeyOf,
    REANALYSIS_SKIP_REASONS,
    versionSeriesDate,
    type AnalysisVersions,
    type ReanalysisJobData,
    type ReanalysisRunStatus,
    type ReanalysisSkipReason,
} from '@lib/sales-ai-analytics';
import { promptVersionOf } from './call-report-retest.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Запись ais в объёме, нужном переразбору (старая запись — источник ссылок). */
export interface ReanalysisRecordView {
    id: string;
    status?: string | null;
    type?: string | null;
    transcription_id?: string | null;
    user_result: unknown;
    report_item_id?: string | null;
    activity_id?: string | null;
    entity_type?: string | null;
    entity_id?: number | null;
    user_id?: number | null;
}

/** Лёгкая строка транскрипции в объёме отбора. */
export interface ReanalysisTranscriptionView {
    id: string;
    userId: string | null;
    callStartedAt: Date | null;
    createdAt: Date | null;
}

export interface ReanalysisCandidate {
    transcriptionId: string;
    userId: string | null;
    /** Активная старая запись разбора (будет помечена superseded). */
    old: ReanalysisRecordView;
    oldPromptVersion: string | null;
    oldSeries: string | null;
}

export interface ReanalysisSelection {
    candidates: ReanalysisCandidate[];
    skippedBy: Record<ReanalysisSkipReason, number>;
}

/** Итог части прогона — в лог и в результат джобы. */
export interface CallReportReanalyzeResult {
    domain: string;
    from: string;
    to: string;
    part: number;
    promptVersion: string;
    dryRun: boolean;
    candidates: number;
    /** Обработано в этой части (успех + сбой). */
    processed: number;
    done: number;
    failed: number;
    skipped: number;
    tokens: number;
    price: number;
    timeBudgetHit: boolean;
    /** jobId продолжения; null — кандидатов не осталось или часть ничего не смогла. */
    continuedWith: string | null;
    statusId: string;
    /** id записей отчёта согласия версий (по старой серии). */
    reportIds: string[];
    elapsedMs: number;
}

export function emptySkipCounts(): Record<ReanalysisSkipReason, number> {
    return Object.fromEntries(
        REANALYSIS_SKIP_REASONS.map(reason => [reason, 0]),
    ) as Record<ReanalysisSkipReason, number>;
}

/**
 * Границы выборки из БД по датам портала: сутки запаса с каждой стороны
 * (UTC), точный отбор — по ключу дня в поясе портала (`dayKeyInWindow`).
 */
export function windowBounds(
    from: string,
    to: string,
): { from: Date; to: Date } {
    return {
        from: new Date(Date.parse(`${from}T00:00:00.000Z`) - DAY_MS),
        to: new Date(Date.parse(`${to}T00:00:00.000Z`) + 2 * DAY_MS),
    };
}

/** Дата звонка попадает в [from; to] по дням в поясе портала; без даты — нет. */
export function dayKeyInWindow(
    date: Date | null,
    from: string,
    to: string,
    timeZone: string,
): boolean {
    if (date === null) return false;
    const key = dateKeyOf(date, timeZone);
    return key >= from && key <= to;
}

/** Сотрудник в списке; список null — все; без владельца при списке — нет. */
export function isInRoster(
    userId: string | null,
    roster: readonly number[] | null,
): boolean {
    if (roster === null) return true;
    return userId !== null && roster.includes(Number(userId));
}

/** Записи agent-analysis по транскрипциям. */
export function analysisByTranscription<T extends ReanalysisRecordView>(
    records: readonly T[],
): Map<string, T[]> {
    const grouped = new Map<string, T[]>();
    for (const record of records) {
        if (record.type !== AGENT_ANALYSIS_TYPE || !record.transcription_id) {
            continue;
        }
        const key = String(record.transcription_id);
        const list = grouped.get(key) ?? [];
        list.push(record);
        grouped.set(key, list);
    }
    return grouped;
}

/**
 * Кандидаты переразбора: транскрипции окна × сотрудники списка, у которых
 * активный разбор другой серии промпта (или без версий). Без разбора —
 * пропуск (короткие/нерелевантные заново не разбираем); активный разбор
 * текущей серии — пропуск (повтор запуска безопасен).
 */
export function selectReanalysisCandidates(input: {
    transcriptions: readonly ReanalysisTranscriptionView[];
    records: readonly ReanalysisRecordView[];
    currentSeries: string | null;
    roster: readonly number[] | null;
}): ReanalysisSelection {
    const grouped = analysisByTranscription(input.records);
    const skippedBy = emptySkipCounts();
    const candidates: ReanalysisCandidate[] = [];
    for (const transcription of input.transcriptions) {
        if (!isInRoster(transcription.userId, input.roster)) {
            skippedBy.notInRoster += 1;
            continue;
        }
        const own = grouped.get(transcription.id) ?? [];
        if (own.length === 0) {
            skippedBy.noAnalysis += 1;
            continue;
        }
        const old = pickActiveAnalysis(own);
        if (old === null) {
            skippedBy.noActive += 1;
            continue;
        }
        const oldPromptVersion = promptVersionOf(old.user_result);
        const oldSeries =
            oldPromptVersion === null
                ? null
                : versionSeriesDate(oldPromptVersion);
        if (oldSeries !== null && oldSeries === input.currentSeries) {
            skippedBy.upToDate += 1;
            continue;
        }
        candidates.push({
            transcriptionId: transcription.id,
            userId: transcription.userId,
            old,
            oldPromptVersion,
            oldSeries,
        });
    }
    return { candidates, skippedBy };
}

/**
 * Статус части: продолжение незаконченного прогона той же версии несёт
 * счётчики дальше (done/failed/tokens/price/startedAt), иначе — новый.
 */
export function initialRunStatus(input: {
    data: ReanalysisJobData;
    versions: AnalysisVersions;
    roster: number[] | null;
    selection: ReanalysisSelection;
    previous: ReanalysisRunStatus | null;
    now: Date;
}): ReanalysisRunStatus {
    const { data, versions, selection, previous, now } = input;
    const part = data.part ?? 1;
    const carry =
        part > 1 &&
        previous !== null &&
        !previous.finished &&
        !previous.dryRun &&
        previous.promptVersion === versions.prompt;
    return {
        domain: data.domain,
        from: data.from,
        to: data.to,
        userIds: input.roster,
        dryRun: data.dryRun === true,
        promptVersion: versions.prompt,
        series: versionSeriesDate(versions.prompt),
        part,
        candidates: selection.candidates.length,
        done: carry ? previous.done : 0,
        failed: carry ? previous.failed : 0,
        skipped: Object.values(selection.skippedBy).reduce(
            (sum, value) => sum + value,
            0,
        ),
        skippedBy: selection.skippedBy,
        tokens: carry ? previous.tokens : 0,
        price: carry ? previous.price : 0,
        startedAt: carry ? previous.startedAt : now.toISOString(),
        updatedAt: now.toISOString(),
        finished: false,
        lastError: carry ? previous.lastError : null,
        timeBudgetHit: false,
        continuedWith: null,
        estimate: null,
    };
}

/** Итог части из статуса. */
export function toReanalyzeResult(
    status: ReanalysisRunStatus,
    processed: number,
    reportIds: string[],
    statusId: string,
    startedAt: number,
): CallReportReanalyzeResult {
    return {
        domain: status.domain,
        from: status.from,
        to: status.to,
        part: status.part,
        promptVersion: status.promptVersion,
        dryRun: status.dryRun,
        candidates: status.candidates,
        processed,
        done: status.done,
        failed: status.failed,
        skipped: status.skipped,
        tokens: status.tokens,
        price: status.price,
        timeBudgetHit: status.timeBudgetHit,
        continuedWith: status.continuedWith,
        statusId,
        reportIds,
        elapsedMs: Date.now() - startedAt,
    };
}
