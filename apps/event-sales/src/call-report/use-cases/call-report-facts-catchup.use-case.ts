/**
 * Догон фактов v3.1 в старых разборах (этап B4 задания
 * ai/tasks/2026-11-09-ai-khvosty-zadanie.md): готовые транскрипции домена
 * за период, у которых в активном разборе нет группы фактов (исход, вид
 * шага, темы возражений, сбои, цены, допродажа — «движение»; самопред-
 * ставление — «форма»), получают эти факты одним коротким вызовом модели
 * по сохранённой расшифровке.
 *
 * Правила:
 * - оценки разделов, версия промпта и резюме не трогаются: факты
 *   дописываются в ту же запись `agent-analysis` (новая не создаётся),
 *   расход ложится отдельной записью `agent-analysis-facts`;
 * - Битрикс не вызывается: карточки, таймлайн и уведомления не меняются;
 * - квота на часть и бюджет 45 минут, остаток — продолжением той же
 *   нагрузкой; повтор запуска безопасен — догнанные пропускаются;
 * - три звонка одновременно, после серии сбоев — по одному, после восьми
 *   подряд — остановка части (пул переразбора);
 * - статус прогона — запись `call-report-facts-catchup-run`, после каждого
 *   звонка; dryRun — кандидаты и оценка стоимости без модели.
 *
 * `@Injectable` без bitrix-состояния.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { AiService, TranscriptionStoreService } from '@lib/call-lib';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    FACTS_CATCHUP_DEFAULTS,
    FACTS_CATCHUP_JOB_OPTIONS,
    factsCatchupJobId,
    resolveTimeZone,
    type FactsCatchupJobData,
} from '@lib/sales-ai-analytics';
import { mergeCatchupFacts } from '../contracts/call-report-facts-catchup.contract';
import { CallFactsCatchupService } from '../services/call-facts-catchup.service';
import { CallReportFactsCatchupStatusService } from '../services/call-report-facts-catchup-status.service';
import { CallReportReanalysisReportService } from '../services/call-report-reanalysis-report.service';
import { CallReportSettingsService } from '../services/call-report-settings.service';
import {
    estimateFactsCatchupCost,
    initialFactsCatchupStatus,
    selectFactsCatchupCandidates,
    toFactsCatchupResult,
    type CallReportFactsCatchupResult,
    type FactsCatchupCandidate,
} from './call-report-facts-catchup.util';
import {
    runReanalysisPool,
    type ReanalysisOneOutcome,
} from './call-report-reanalyze.pool';
import {
    accountOutcome,
    dayKeyInWindow,
    windowBounds,
    type ReanalysisTranscriptionView,
} from './call-report-reanalyze.util';

export type { CallReportFactsCatchupResult } from './call-report-facts-catchup.util';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

@Injectable()
export class CallReportFactsCatchupUseCase {
    private readonly logger = new Logger(CallReportFactsCatchupUseCase.name);

    constructor(
        private readonly aiService: AiService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly facts: CallFactsCatchupService,
        private readonly status: CallReportFactsCatchupStatusService,
        private readonly analyses: CallReportReanalysisReportService,
        private readonly settingsService: CallReportSettingsService,
        private readonly queueDispatcher: QueueDispatcherService,
    ) {}

    async execute(
        data: FactsCatchupJobData,
        now: Date = new Date(),
    ): Promise<CallReportFactsCatchupResult> {
        const startedAt = Date.now();
        const settings = await this.settingsService.resolve(data.domain);
        const transcriptions = await this.transcriptionsOf(data);
        const selection = selectFactsCatchupCandidates({
            transcriptions,
            records: await this.analyses.loadAnalyses(
                data.domain,
                transcriptions.map(row => row.id),
            ),
        });
        const previous = await this.status.loadStatus(
            data.domain,
            data.from,
            data.to,
        );
        const status = initialFactsCatchupStatus({
            data,
            selection,
            previous: previous?.status ?? null,
            now,
        });
        let statusId = previous?.id ?? null;
        if (data.dryRun === true) {
            status.estimate = estimateFactsCatchupCost(
                await this.status.recentFactsUsage(data.domain, now),
                await this.analyses.recentUsage(data.domain, now),
                selection.candidates.length,
            );
            status.finished = true;
            statusId = await this.status.saveStatus(status, statusId);
            return toFactsCatchupResult(
                status,
                0,
                statusId,
                startedAt,
                Date.now(),
            );
        }
        statusId = await this.status.saveStatus(status, statusId);
        const recordId = statusId;
        const quota = data.quota ?? FACTS_CATCHUP_DEFAULTS.quota;
        const pool = await runReanalysisPool(
            selection.candidates.slice(0, quota),
            candidate =>
                this.catchUpOne(
                    data.domain,
                    candidate,
                    settings.deepAnalysisModel,
                ),
            async (outcome, elapsedMs, state) => {
                accountOutcome(status, outcome, elapsedMs, state);
                status.updatedAt = new Date().toISOString();
                await this.status.saveStatus(status, recordId);
            },
            {
                concurrency: FACTS_CATCHUP_DEFAULTS.concurrency,
                serialAfterFailures: FACTS_CATCHUP_DEFAULTS.serialAfterFailures,
                stopAfterFailures: FACTS_CATCHUP_DEFAULTS.stopAfterFailures,
                timeBudgetMs: FACTS_CATCHUP_DEFAULTS.timeBudgetMs,
                startedAt,
                now: () => Date.now(),
            },
        );
        status.timeBudgetHit = pool.timeBudgetHit;
        status.stopped = pool.stopped;
        const remaining = selection.candidates.length - pool.processed;
        status.continuedWith =
            remaining > 0 && pool.doneInPart > 0 && !pool.stopped
                ? await this.dispatchContinuation(data, status.part + 1)
                : null;
        status.finished = status.continuedWith === null && !pool.stopped;
        status.updatedAt = new Date().toISOString();
        await this.status.saveStatus(status, statusId);
        const result = toFactsCatchupResult(
            status,
            pool.processed,
            statusId,
            startedAt,
            Date.now(),
        );
        this.logger.log(
            `Догон фактов ${data.domain} ${data.from}..${data.to} часть ${status.part}: ` +
                `кандидатов ${result.candidates}, догнано ${pool.doneInPart}, ` +
                `сбоев ${status.failed}, одновременно ${pool.concurrency}, ` +
                `продолжение ${result.continuedWith ?? '—'}`,
        );
        return result;
    }

    /** Транскрипции окна по дням в поясе портала (из широкой UTC-выборки). */
    private async transcriptionsOf(
        data: FactsCatchupJobData,
    ): Promise<ReanalysisTranscriptionView[]> {
        const bounds = windowBounds(data.from, data.to);
        const timeZone = resolveTimeZone(
            data.timeZone ?? FACTS_CATCHUP_DEFAULTS.timeZone,
        );
        const rows = await this.transcriptionStore.findDoneInPeriodLite(
            data.domain,
            bounds.from,
            bounds.to,
        );
        return rows.filter(row =>
            dayKeyInWindow(
                row.callStartedAt ?? row.createdAt,
                data.from,
                data.to,
                timeZone,
            ),
        );
    }

    /** Один звонок: вызов модели, факты в запись разбора, запись расхода. */
    private async catchUpOne(
        domain: string,
        candidate: FactsCatchupCandidate,
        model: string | null,
    ): Promise<ReanalysisOneOutcome> {
        try {
            const source = candidate.old.user_result;
            if (!isRecord(source)) {
                return { ok: false, error: 'разбор без user_result' };
            }
            const outcome = await this.facts.run({
                transcriptionId: candidate.transcriptionId,
                source,
                model,
            });
            if (outcome === null) {
                return {
                    ok: false,
                    error: 'пустая расшифровка или ответ модели не той формы',
                };
            }
            const at = new Date().toISOString();
            const merged = mergeCatchupFacts(
                source,
                outcome.facts,
                candidate.gaps,
                {
                    at,
                    model: outcome.model,
                    provider: outcome.provider,
                },
            );
            await this.aiService.update(candidate.old.id, {
                user_result: JSON.parse(
                    JSON.stringify(merged),
                ) as Prisma.JsonValue,
            });
            await this.status.writeFactsRecord({
                domain,
                transcriptionId: candidate.transcriptionId,
                old: candidate.old,
                facts: outcome.facts,
                gaps: candidate.gaps,
                usage: outcome.usage,
                model: outcome.model,
                provider: outcome.provider,
                at,
            });
            return { ok: true, usage: outcome.usage };
        } catch (error) {
            const message = (error as Error).message;
            this.logger.warn(
                `Догон фактов ${candidate.transcriptionId} не удался: ${message}`,
            );
            return { ok: false, error: message };
        }
    }

    /** Продолжение той же нагрузкой; jobId несёт номер части. */
    private async dispatchContinuation(
        data: FactsCatchupJobData,
        part: number,
    ): Promise<string> {
        const payload: FactsCatchupJobData = { ...data, part };
        const jobId = factsCatchupJobId(payload);
        await this.queueDispatcher.dispatch(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_FACTS_CATCHUP,
            payload,
            jobId,
            FACTS_CATCHUP_JOB_OPTIONS,
        );
        return jobId;
    }
}
