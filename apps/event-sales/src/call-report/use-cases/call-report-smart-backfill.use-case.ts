/**
 * Дописывание полей карточек разборов из записей ais без вызова модели
 * (инцидент 13–30.10.2026: 422 карточки с пустыми полями при целых
 * данных в БД). Кандидаты — активные записи `agent-analysis` окна с
 * элементом смарта: режим `period` берёт все, `pending` — только те, у
 * которых запись полей не удалась (in_report = false). Каждая карточка
 * переписывается AgentAnalysisSmartRewriteService (та же сборка, что у
 * приёма); новый элемент не создаётся никогда.
 *
 * Правила:
 * - квота на часть и бюджет времени; остались кандидаты — джоба сама
 *   ставит продолжение (part + 1; в режиме `period` — со смещением, в
 *   `pending` выборка сужается сама по in_report);
 * - продолжение только если часть что-то смогла — иначе упорный сбой
 *   крутил бы цепочку бесконечно; смарт не установлен — часть
 *   останавливается сразу;
 * - статус прогона — запись `call-report-smart-backfill-run`, обновляется
 *   каждые N карточек; dryRun — только подсчёт кандидатов.
 *
 * `@Injectable` без bitrix-состояния.
 */
import { Injectable, Logger } from '@nestjs/common';
import { AGENT_ANALYSIS_TYPE, AiService } from '@lib/call-lib';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    resolveTimeZone,
    SMART_BACKFILL_DEFAULTS,
    SMART_BACKFILL_JOB_OPTIONS,
    smartBackfillJobId,
    type SmartBackfillJobData,
    type SmartBackfillRunStatus,
} from '@lib/sales-ai-analytics';
import {
    AgentAnalysisSmartRewriteService,
    type AgentAnalysisRewriteOutcome,
} from '../../agent-gate/services/agent-analysis-smart-rewrite.service';
import { CallReportSmartBackfillStatusService } from '../services/call-report-smart-backfill-status.service';
import { windowBounds } from './call-report-reanalyze.util';
import {
    initialSmartBackfillStatus,
    selectSmartBackfillCandidates,
    toSmartBackfillResult,
    type CallReportSmartBackfillResult,
    type SmartBackfillCandidate,
} from './call-report-smart-backfill.util';

export type { CallReportSmartBackfillResult } from './call-report-smart-backfill.util';

const SMART_MISSING_ERROR =
    'смарт «AI-анализ звонков» на портале не установлен — дописывать некуда';

@Injectable()
export class CallReportSmartBackfillUseCase {
    private readonly logger = new Logger(CallReportSmartBackfillUseCase.name);

    constructor(
        private readonly aiService: AiService,
        private readonly rewrite: AgentAnalysisSmartRewriteService,
        private readonly statusStore: CallReportSmartBackfillStatusService,
        private readonly queueDispatcher: QueueDispatcherService,
    ) {}

    async execute(
        data: SmartBackfillJobData,
        now: Date = new Date(),
    ): Promise<CallReportSmartBackfillResult> {
        const startedAt = Date.now();
        const part = data.part ?? 1;
        const timeZone = resolveTimeZone(
            data.timeZone ?? SMART_BACKFILL_DEFAULTS.timeZone,
        );
        const bounds = windowBounds(data.from, data.to);
        const records = await this.aiService.findSmartWriteCandidates(
            data.domain,
            AGENT_ANALYSIS_TYPE,
            bounds.from,
            bounds.to,
            { pendingOnly: data.mode === 'pending' },
        );
        const selection = selectSmartBackfillCandidates(records, {
            from: data.from,
            to: data.to,
            timeZone,
        });
        const previous = await this.statusStore.load(
            data.domain,
            data.mode,
            data.from,
            data.to,
        );
        const status = initialSmartBackfillStatus({
            data,
            selection,
            previous: previous?.status ?? null,
            now,
        });
        let statusId = previous?.id ?? null;
        if (data.dryRun === true) {
            status.finished = true;
            statusId = await this.statusStore.save(status, statusId);
            return toSmartBackfillResult(status, 0, statusId, startedAt);
        }
        statusId = await this.statusStore.save(status, statusId);

        // Режим period: выборка не сужается — следующая часть идёт со
        // смещением; pending: переписанные уходят из выборки сами.
        const offset = data.mode === 'period' ? (data.offset ?? 0) : 0;
        const quota = data.quota ?? SMART_BACKFILL_DEFAULTS.quota;
        const batch = selection.candidates.slice(offset, offset + quota);
        let processed = 0;
        let doneInPart = 0;
        let stop = false;
        for (const candidate of batch) {
            if (Date.now() - startedAt > SMART_BACKFILL_DEFAULTS.timeBudgetMs) {
                status.timeBudgetHit = true;
                break;
            }
            const outcome = await this.rewriteOne(candidate);
            processed += 1;
            if (outcome.kind === 'written') doneInPart += 1;
            stop = this.apply(status, outcome, candidate);
            if (stop) break;
            if (processed % SMART_BACKFILL_DEFAULTS.statusEvery === 0) {
                status.updatedAt = new Date().toISOString();
                await this.statusStore.save(status, statusId);
            }
        }

        const remaining = selection.candidates.length - offset - processed;
        status.continuedWith =
            !stop && remaining > 0 && doneInPart > 0
                ? await this.dispatchContinuation(
                      data,
                      part + 1,
                      offset + processed,
                  )
                : null;
        status.finished = status.continuedWith === null;
        status.updatedAt = new Date().toISOString();
        await this.statusStore.save(status, statusId);
        const result = toSmartBackfillResult(
            status,
            processed,
            statusId,
            startedAt,
        );
        this.logger.log(
            `Дописывание полей ${data.domain} ${data.mode} ${data.from}..${data.to} ` +
                `часть ${part}: кандидатов ${selection.candidates.length}, ` +
                `записано ${doneInPart}, сбоев ${status.failed}, без элемента ${status.missing}, ` +
                `продолжение ${result.continuedWith ?? '—'}`,
        );
        return result;
    }

    /** Одна карточка: запись читается целиком только здесь (user_result тяжёлый). */
    private async rewriteOne(
        candidate: SmartBackfillCandidate,
    ): Promise<AgentAnalysisRewriteOutcome> {
        try {
            const record = await this.aiService.findById(candidate.id);
            return await this.rewrite.rewrite({
                id: record.id,
                transcription_id: record.transcription_id || null,
                user_result: record.user_result as unknown,
                provider: record.provider || null,
            });
        } catch (error) {
            return {
                kind: 'failed',
                error: (error as Error).message,
                itemId: null,
            };
        }
    }

    /** Разносит итог по счётчикам; true — часть надо остановить. */
    private apply(
        status: SmartBackfillRunStatus,
        outcome: AgentAnalysisRewriteOutcome,
        candidate: SmartBackfillCandidate,
    ): boolean {
        switch (outcome.kind) {
            case 'written':
                status.done += 1;
                return false;
            case 'itemMissing':
                status.missing += 1;
                this.logger.warn(
                    `Элемент #${candidate.reportItemId} по записи ${candidate.id} на портале не найден — пропуск`,
                );
                return false;
            case 'noPayload':
                status.skipped += 1;
                status.skippedBy.noPayload += 1;
                return false;
            case 'smartMissing':
                status.failed += 1;
                status.lastError = SMART_MISSING_ERROR;
                return true;
            case 'failed':
                status.failed += 1;
                status.lastError = outcome.error;
                this.logger.warn(
                    `Поля карточки #${outcome.itemId ?? candidate.reportItemId} ` +
                        `(запись ${candidate.id}) не дописаны: ${outcome.error}`,
                );
                return false;
        }
    }

    /** Продолжение той же нагрузкой; jobId несёт номер части. */
    private async dispatchContinuation(
        data: SmartBackfillJobData,
        part: number,
        offset: number,
    ): Promise<string> {
        const payload: SmartBackfillJobData = { ...data, part, offset };
        const jobId = smartBackfillJobId(payload);
        await this.queueDispatcher.dispatch(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_SMART_BACKFILL,
            payload,
            jobId,
            SMART_BACKFILL_JOB_OPTIONS,
        );
        return jobId;
    }
}
