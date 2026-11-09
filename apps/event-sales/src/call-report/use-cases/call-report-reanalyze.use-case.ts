/**
 * Переразбор истории текущей версией промпта (план
 * ai/tasks/2026-10-19-ai-focus-plan.md, этап 1B; решение владельца 19.10):
 * готовые транскрипции домена за период × пилотные сотрудники, у которых
 * активный разбор другой серии промпта, разбираются заново тем же
 * фокус-разбором (CallAnalysisRerunService), новая запись `agent-analysis`
 * копирует ссылки старой (карточка смарта, дело, сущность, владелец), а
 * старая переводится в `superseded`.
 *
 * Правила:
 * - Битрикс не вызывается вовсе: карточки разборов не трогаются, алерты
 *   не шлются, смарт и таймлайн не меняются;
 * - квота на часть и бюджет времени 45 минут; остались кандидаты — джоба
 *   сама ставит продолжение (та же нагрузка, part + 1); повтор запуска
 *   безопасен — уже пересчитанные пропускаются по серии версии;
 * - три звонка одновременно (решение владельца 09.11.2026), после трёх
 *   сбоев подряд — по одному, после восьми — остановка части
 *   (call-report-reanalyze.pool.ts);
 * - статус прогона — запись `call-report-reanalysis-run`, обновляется
 *   после каждого звонка («переразобрано N из M, осталось ≈ X минут»);
 *   незаконченный прогон продолжается с теми же счётчиками и после
 *   перезапуска воркера; dryRun — кандидаты и оценка стоимости без модели;
 * - по окончании части — отчёт согласия старой и новой версии по парам
 *   окна (`ai-analytics-version-agreement`), по ключу на старую серию.
 *
 * `@Injectable` без bitrix-состояния.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
    AI_RECORD_SUPERSEDED_STATUS,
    AiService,
    CallTypeRegistryService,
    TranscriptionStoreService,
} from '@lib/call-lib';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    REANALYSIS_DEFAULTS,
    REANALYSIS_JOB_OPTIONS,
    REANALYSIS_PROVIDER,
    reanalyzeJobId,
    resolveTimeZone,
    type AnalysisVersions,
    type ReanalysisJobData,
} from '@lib/sales-ai-analytics';
import {
    durationSecOf,
    prepareAgentAnalysis,
} from '../../agent-gate/services/agent-analysis-prepare.util';
import {
    buildAnalysisVersions,
    buildRegistryHash,
    CALL_REPORT_REGISTRY_BUILTIN,
} from '../contracts/call-report-versions.const';
import { CallAnalysisRerunService } from '../services/call-analysis-rerun.service';
import { CallReportReanalysisReportService } from '../services/call-report-reanalysis-report.service';
import { CallReportSettingsService } from '../services/call-report-settings.service';
import {
    runReanalysisPool,
    type ReanalysisOneOutcome,
} from './call-report-reanalyze.pool';
import {
    buildReanalysisRecord,
    estimateReanalysisCost,
} from './call-report-reanalyze.record';
import {
    accountOutcome,
    dayKeyInWindow,
    initialRunStatus,
    selectReanalysisCandidates,
    toReanalyzeResult,
    windowBounds,
    type CallReportReanalyzeResult,
    type ReanalysisCandidate,
    type ReanalysisTranscriptionView,
} from './call-report-reanalyze.util';

export type { CallReportReanalyzeResult } from './call-report-reanalyze.util';

@Injectable()
export class CallReportReanalyzeUseCase {
    private readonly logger = new Logger(CallReportReanalyzeUseCase.name);

    constructor(
        private readonly aiService: AiService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly rerunService: CallAnalysisRerunService,
        private readonly settingsService: CallReportSettingsService,
        private readonly callTypeRegistry: CallTypeRegistryService,
        private readonly reports: CallReportReanalysisReportService,
        private readonly queueDispatcher: QueueDispatcherService,
    ) {}

    async execute(
        data: ReanalysisJobData,
        now: Date = new Date(),
    ): Promise<CallReportReanalyzeResult> {
        const startedAt = Date.now();
        const versions = buildAnalysisVersions(
            await this.registryHash(data.domain),
        );
        const settings = await this.settingsService.resolve(data.domain);
        const roster = data.userIds ?? settings.allowedUserIds;
        const transcriptions = await this.transcriptionsOf(data);
        const transcriptionIds = transcriptions.map(row => row.id);
        const selection = selectReanalysisCandidates({
            transcriptions,
            records: await this.reports.loadAnalyses(
                data.domain,
                transcriptionIds,
            ),
            currentPromptVersion: versions.prompt,
            roster,
        });
        const previous = await this.reports.loadStatus(
            data.domain,
            data.from,
            data.to,
        );
        const status = initialRunStatus({
            data,
            versions,
            roster,
            selection,
            previous: previous?.status ?? null,
            now,
        });
        let statusId = previous?.id ?? null;
        if (data.dryRun === true) {
            status.estimate = estimateReanalysisCost(
                await this.reports.recentUsage(data.domain, now),
                selection.candidates.length,
            );
            status.finished = true;
            statusId = await this.reports.saveStatus(status, statusId);
            return toReanalyzeResult(status, 0, [], statusId, startedAt);
        }
        statusId = await this.reports.saveStatus(status, statusId);

        const quota = data.quota ?? REANALYSIS_DEFAULTS.quota;
        const recordId = statusId;
        const pool = await runReanalysisPool(
            selection.candidates.slice(0, quota),
            candidate =>
                this.reanalyzeOne(
                    candidate,
                    versions,
                    settings.deepAnalysisModel,
                ),
            async (outcome, elapsedMs, state) => {
                // Статус — после каждого звонка: панель показывает «N из M,
                // осталось ≈ X минут», а перезапуск воркера ничего не теряет.
                accountOutcome(status, outcome, elapsedMs, state);
                status.updatedAt = new Date().toISOString();
                await this.reports.saveStatus(status, recordId);
            },
            {
                concurrency: REANALYSIS_DEFAULTS.concurrency,
                serialAfterFailures: REANALYSIS_DEFAULTS.serialAfterFailures,
                stopAfterFailures: REANALYSIS_DEFAULTS.stopAfterFailures,
                timeBudgetMs: REANALYSIS_DEFAULTS.timeBudgetMs,
                startedAt,
                now: () => Date.now(),
            },
        );
        status.timeBudgetHit = pool.timeBudgetHit;
        status.stopped = pool.stopped;
        const { processed, doneInPart } = pool;

        // Продолжение — только если часть что-то смогла и не остановлена
        // серией сбоев: иначе упорный сбой крутил бы цепочку бесконечно.
        const remaining = selection.candidates.length - processed;
        status.continuedWith =
            remaining > 0 && doneInPart > 0 && !pool.stopped
                ? await this.dispatchContinuation(data, status.part + 1)
                : null;
        const reportIds = await this.reports.writeAgreementReports(
            data.domain,
            transcriptionIds,
            versions,
            now,
        );
        // Остановленная серией сбоев часть — не конец прогона: панель покажет
        // «остановился», а повторный запуск продолжит счётчики.
        status.finished = status.continuedWith === null && !pool.stopped;
        status.updatedAt = new Date().toISOString();
        await this.reports.saveStatus(status, statusId);
        const result = toReanalyzeResult(
            status,
            processed,
            reportIds,
            statusId,
            startedAt,
        );
        this.logger.log(
            `Переразбор ${data.domain} ${data.from}..${data.to} часть ${status.part}: ` +
                `кандидатов ${result.candidates}, сделано ${doneInPart}, ` +
                `сбоев ${status.failed}, одновременно ${pool.concurrency}, ` +
                `продолжение ${result.continuedWith ?? '—'}`,
        );

        return result;
    }

    /** Транскрипции окна по дням в поясе портала (из широкой UTC-выборки). */
    private async transcriptionsOf(
        data: ReanalysisJobData,
    ): Promise<ReanalysisTranscriptionView[]> {
        const bounds = windowBounds(data.from, data.to);
        const timeZone = resolveTimeZone(
            data.timeZone ?? REANALYSIS_DEFAULTS.timeZone,
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

    /** Переразбор одного звонка: новая запись + superseded старой; Битрикс не трогается. */
    private async reanalyzeOne(
        candidate: ReanalysisCandidate,
        versions: AnalysisVersions,
        model: string | null,
    ): Promise<ReanalysisOneOutcome> {
        try {
            const outcome = await this.rerunService.rerun({
                transcriptionId: candidate.transcriptionId,
                source: candidate.old.user_result,
                model,
            });
            if (outcome === null) {
                return { ok: false, error: 'модель не вернула разбор' };
            }
            const dto = prepareAgentAnalysis(
                candidate.transcriptionId,
                REANALYSIS_PROVIDER,
                outcome.dto,
                durationSecOf(outcome.row),
                this.logger,
            );
            await this.aiService.create(
                buildReanalysisRecord({
                    row: outcome.row,
                    old: candidate.old,
                    dto,
                    versions,
                    usage: outcome.usage,
                    model,
                }),
            );
            await this.aiService.update(candidate.old.id, {
                status: AI_RECORD_SUPERSEDED_STATUS,
            });
            return { ok: true, usage: outcome.usage };
        } catch (error) {
            const message = (error as Error).message;
            this.logger.warn(
                `Переразбор ${candidate.transcriptionId} не удался: ${message}`,
            );
            return { ok: false, error: message };
        }
    }

    /** Продолжение той же нагрузкой; jobId несёт номер части. */
    private async dispatchContinuation(
        data: ReanalysisJobData,
        part: number,
    ): Promise<string> {
        const payload: ReanalysisJobData = { ...data, part };
        const jobId = reanalyzeJobId(payload);
        await this.queueDispatcher.dispatch(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_REANALYZE,
            payload,
            jobId,
            REANALYSIS_JOB_OPTIONS,
        );
        return jobId;
    }

    /** Хэш реестра типов домена; реестр недоступен — builtin (как в процессоре). */
    private async registryHash(domain: string): Promise<string> {
        try {
            const registry = await this.callTypeRegistry.resolve(domain);

            return buildRegistryHash(registry.codes);
        } catch (error) {
            this.logger.warn(
                `Реестр типов недоступен (${domain}): ${(error as Error).message}`,
            );

            return CALL_REPORT_REGISTRY_BUILTIN;
        }
    }
}
