/**
 * Чистые помощники догона фактов v3.1 (этап B4): отбор кандидатов по
 * недостающим группам фактов, статус части с продолжением счётчиков,
 * оценка стоимости dryRun и итог джобы. Окно дат, группировка записей и
 * учёт итога звонка — общие с переразбором (`call-report-reanalyze.util`).
 *
 * Без DI, Bitrix и `new Date()`.
 */
import { pickActiveAnalysis } from '@lib/call-lib';
import {
    FACTS_CATCHUP_DEFAULTS,
    FACTS_CATCHUP_PROMPT_VERSION,
    FACTS_CATCHUP_SKIP_REASONS,
    type FactsCatchupGroup,
    type FactsCatchupJobData,
    type FactsCatchupRunStatus,
    type FactsCatchupSkipReason,
    type ReanalysisCostEstimate,
} from '@lib/sales-ai-analytics';
import { factsGapsOf } from '../contracts/call-report-facts-catchup.contract';
import { estimateReanalysisCost } from './call-report-reanalyze.record';
import {
    analysisByTranscription,
    type ReanalysisRecordView,
    type ReanalysisTranscriptionView,
} from './call-report-reanalyze.util';

export interface FactsCatchupCandidate {
    transcriptionId: string;
    userId: string | null;
    /** Активная запись разбора, в которую дописываются факты. */
    old: ReanalysisRecordView;
    gaps: FactsCatchupGroup[];
}

export interface FactsCatchupSelection {
    candidates: FactsCatchupCandidate[];
    skippedBy: Record<FactsCatchupSkipReason, number>;
}

/** Итог части прогона — в лог и в результат джобы. */
export interface CallReportFactsCatchupResult {
    domain: string;
    from: string;
    to: string;
    part: number;
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
    continuedWith: string | null;
    statusId: string;
    elapsedMs: number;
}

export function emptyFactsSkipCounts(): Record<FactsCatchupSkipReason, number> {
    return Object.fromEntries(
        FACTS_CATCHUP_SKIP_REASONS.map(reason => [reason, 0]),
    ) as Record<FactsCatchupSkipReason, number>;
}

/**
 * Кандидаты догона: транскрипции окна с активным разбором, в котором нет
 * хотя бы одной группы фактов. Список сотрудников не применяется — факты
 * нужны отчётам по всему отделу. Разбор с обеими группами — пропуск
 * (повтор запуска безопасен).
 */
export function selectFactsCatchupCandidates(input: {
    transcriptions: readonly ReanalysisTranscriptionView[];
    records: readonly ReanalysisRecordView[];
}): FactsCatchupSelection {
    const grouped = analysisByTranscription(input.records);
    const skippedBy = emptyFactsSkipCounts();
    const candidates: FactsCatchupCandidate[] = [];
    for (const transcription of input.transcriptions) {
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
        const gaps = factsGapsOf(old.user_result);
        if (gaps.length === 0) {
            skippedBy.hasFacts += 1;
            continue;
        }
        candidates.push({
            transcriptionId: transcription.id,
            userId: transcription.userId,
            old,
            gaps,
        });
    }
    return { candidates, skippedBy };
}

/**
 * Статус части: незаконченный прогон той же версии продолжается —
 * счётчики идут дальше, номер части растёт; dryRun всегда с нуля (как у
 * переразбора).
 */
export function initialFactsCatchupStatus(input: {
    data: FactsCatchupJobData;
    selection: FactsCatchupSelection;
    previous: FactsCatchupRunStatus | null;
    now: Date;
}): FactsCatchupRunStatus {
    const { data, selection, previous, now } = input;
    const carry =
        data.dryRun !== true &&
        previous !== null &&
        !previous.finished &&
        !previous.dryRun &&
        previous.promptVersion === FACTS_CATCHUP_PROMPT_VERSION;
    const done = carry ? previous.done : 0;
    return {
        domain: data.domain,
        from: data.from,
        to: data.to,
        dryRun: data.dryRun === true,
        promptVersion: FACTS_CATCHUP_PROMPT_VERSION,
        part: carry ? previous.part + 1 : (data.part ?? 1),
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
        processingMs: carry ? previous.processingMs : 0,
        etaMinutes: null,
        concurrency: FACTS_CATCHUP_DEFAULTS.concurrency,
        stopped: false,
    };
}

/**
 * Оценка стоимости dryRun: по недавним записям догона, а пока их нет —
 * по полным разборам домена, делённым на число проходов разбора (один
 * короткий вызов против трёх фокусов и синтеза); нет и их — честно
 * «оценки нет».
 */
export function estimateFactsCatchupCost(
    recentFacts: readonly { tokens_count: number; price: number }[],
    recentAnalyses: readonly { tokens_count: number; price: number }[],
    candidates: number,
): ReanalysisCostEstimate {
    const own = estimateReanalysisCost(recentFacts, candidates);
    if (own.basedOnRecords > 0) {
        return {
            ...own,
            message: own.message.replace('разборам', 'догонам фактов'),
        };
    }
    const divisor = FACTS_CATCHUP_DEFAULTS.fullAnalysisCalls;
    const scaled = estimateReanalysisCost(
        recentAnalyses.map(record => ({
            tokens_count: Math.round(record.tokens_count / divisor),
            price: record.price / divisor,
        })),
        candidates,
    );
    if (scaled.basedOnRecords === 0) {
        return {
            ...scaled,
            message:
                'Оценки нет: у разборов домена ещё нет учёта токенов — ' +
                'появится после первых разборов или догонов.',
        };
    }
    return {
        ...scaled,
        message:
            `Приблизительно, по ${scaled.basedOnRecords} недавним полным ` +
            `разборам как одна ${divisor}-я их расхода: ${scaled.avgTokens} ` +
            `токенов, ${scaled.avgPrice} ₽ за звонок; точнее — после первых догонов.`,
    };
}

/** Итог части из статуса. */
export function toFactsCatchupResult(
    status: FactsCatchupRunStatus,
    processed: number,
    statusId: string,
    startedAt: number,
    nowMs: number,
): CallReportFactsCatchupResult {
    return {
        domain: status.domain,
        from: status.from,
        to: status.to,
        part: status.part,
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
        elapsedMs: nowMs - startedAt,
    };
}
