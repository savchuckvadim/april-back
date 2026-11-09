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
    REANALYSIS_DEFAULTS,
    REANALYSIS_SKIP_REASONS,
    versionSeriesDate,
    type AnalysisVersions,
    type ReanalysisJobData,
    type ReanalysisRunStatus,
    type ReanalysisSkipReason,
} from '@lib/sales-ai-analytics';
import type {
    ReanalysisOneOutcome,
    ReanalysisPoolState,
} from './call-report-reanalyze.pool';
import { promptVersionOf } from './call-report-retest.util';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

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
 * активный разбор ДРУГОЙ ВЕРСИИ промпта (строка `versions.prompt` ≠
 * текущей) или без версий — серия тут не важна: владелец просил
 * пересчитать историю именно текущей версией, а серии накопленной
 * истории объединены (AI_ANALYSIS_SERIES_START). Без разбора — пропуск
 * (короткие/нерелевантные заново не разбираем); активный разбор текущей
 * версии — пропуск (повтор запуска безопасен).
 */
export function selectReanalysisCandidates(input: {
    transcriptions: readonly ReanalysisTranscriptionView[];
    records: readonly ReanalysisRecordView[];
    currentPromptVersion: string;
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
        if (oldPromptVersion === input.currentPromptVersion) {
            skippedBy.upToDate += 1;
            continue;
        }
        const oldSeries =
            oldPromptVersion === null
                ? null
                : versionSeriesDate(oldPromptVersion);
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
 * Статус части: незаконченный прогон той же версии продолжается — счётчики
 * (done/failed/tokens/price/processingMs/startedAt) идут дальше, номер
 * части растёт от прошлой записи. Так ни запуск после перезапуска воркера,
 * ни повторное нажатие кнопки не выглядят как «часть 1 с нуля»
 * (09.11.2026). Законченный или dryRun-прогон не продолжается — новый статус.
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
    const carry =
        previous !== null &&
        !previous.finished &&
        !previous.dryRun &&
        previous.promptVersion === versions.prompt;
    const part = carry ? previous.part + 1 : (data.part ?? 1);
    const done = carry ? previous.done : 0;
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
        done,
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
        total: done + selection.candidates.length,
        processingMs: carry ? (previous.processingMs ?? 0) : 0,
        etaMinutes: null,
        concurrency: REANALYSIS_DEFAULTS.concurrency,
    };
}

/**
 * Оценка оставшегося времени, минут: среднее чистое время звонка с начала
 * прогона × остаток ÷ одновременность; null — ни одного обработанного.
 */
export function etaMinutesOf(
    status: Pick<
        ReanalysisRunStatus,
        'total' | 'done' | 'failed' | 'processingMs' | 'concurrency'
    >,
): number | null {
    const processed = status.done + status.failed;
    const processingMs = status.processingMs ?? 0;
    if (processed === 0 || processingMs <= 0) return null;
    const remaining = Math.max((status.total ?? 0) - status.done, 0);
    const perCallMs = processingMs / processed;
    const concurrency = Math.max(status.concurrency ?? 1, 1);

    return Math.ceil((remaining * perCallMs) / concurrency / MINUTE_MS);
}

/**
 * Учёт итога одного звонка в статусе прогона: счётчики, расход, чистое
 * время, одновременность пула и оценка «осталось». Остановка части после
 * серии сбоев попадает в lastError — её видно в панели запуска.
 */
export function accountOutcome(
    status: ReanalysisRunStatus,
    outcome: ReanalysisOneOutcome,
    elapsedMs: number,
    pool: ReanalysisPoolState,
): void {
    status.processingMs = (status.processingMs ?? 0) + Math.max(elapsedMs, 0);
    if (outcome.ok) {
        status.done += 1;
        status.tokens += outcome.usage.tokens_count ?? 0;
        status.price += outcome.usage.price ?? 0;
    } else {
        status.failed += 1;
        status.lastError = pool.stopped
            ? `${outcome.error} — остановлено после ${pool.failStreak} сбоев подряд`
            : outcome.error;
    }
    status.concurrency = pool.concurrency;
    status.etaMinutes = etaMinutesOf(status);
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
