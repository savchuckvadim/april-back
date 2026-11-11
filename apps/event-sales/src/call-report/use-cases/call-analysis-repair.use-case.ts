import { Injectable, Logger } from '@nestjs/common';
import {
    AGENT_ANALYSIS_TYPE,
    AI_RECORD_SUPERSEDED_STATUS,
    AiService,
    buildDedupKey,
    CallTypeRegistryService,
    type AiEntityDto,
} from '@lib/call-lib';
import {
    LlmCircuitBreakerService,
    LlmProviderOrderResolver,
} from '@lib/llm-gateway';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import { REANALYSIS_PROVIDER } from '@lib/sales-ai-analytics';
import {
    durationSecOf,
    prepareAgentAnalysis,
} from '../../agent-gate/services/agent-analysis-prepare.util';
import { AgentAnalysisSmartRewriteService } from '../../agent-gate/services/agent-analysis-smart-rewrite.service';
import {
    buildAnalysisVersions,
    buildRegistryHash,
    CALL_REPORT_REGISTRY_BUILTIN,
    methodologyTagOf,
} from '../contracts/call-report-versions.const';
import { CallAnalysisRepairStore } from '../services/call-analysis-repair.store';
import { CallAnalysisRerunService } from '../services/call-analysis-rerun.service';
import { CallReportSettingsService } from '../services/call-report-settings.service';
import {
    REPAIR_LOOKBACK_HOURS,
    REPAIR_MAX_ATTEMPTS,
    REPAIR_QUOTA_PER_DOMAIN,
    selectRepairCandidates,
    type RepairCandidate,
} from './call-analysis-repair.util';
import { buildReanalysisRecord } from './call-report-reanalyze.record';

const HOUR_MS = 60 * 60 * 1000;

/** Повторная стадия анализа: одна попытка, без хвостов в Redis. */
const REPAIR_ANALYZE_JOB_OPTS = {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
};

/** Итог прохода догона по порталу. */
export interface CallAnalysisRepairResult {
    domain: string;
    /** Почему портал пропущен; null — проход был. */
    skipped: string | null;
    /** Неполных разборов переделано полностью. */
    repaired: number;
    /** Переделаны, но опять неполные — попробуем в следующий раз. */
    stillPartial: number;
    /** Звонков без разбора поставлено на анализ заново. */
    requeued: number;
    /** Брошено после REPAIR_MAX_ATTEMPTS попыток. */
    gaveUp: number;
}

/**
 * ДОГОН РАЗБОРОВ (требование владельца 10.11.2026): то, что не собралось
 * из-за сбоя поставщика модели, переделывается, когда поставщик снова
 * отвечает.
 *  - Звонок остался без разбора (модель не ответила ни на фокус, ни на
 *    страховку, или фокус оборвался на поставщике — тогда страховку не
 *    зовут) — процессор отметил его в Redis; здесь стадия анализа
 *    ставится заново тем же путём, что у обычного звонка.
 *  - Разбор неполный (не собрался проход, синтез или методика) — разбор
 *    переделывается как при переразборе истории: новая запись, старая —
 *    superseded, поля карточки в смарте переписываются из новой.
 * Портал пропускается, пока его первый поставщик на паузе предохранителя.
 * У каждого звонка не больше REPAIR_MAX_ATTEMPTS попыток.
 */
@Injectable()
export class CallAnalysisRepairUseCase {
    private readonly logger = new Logger(CallAnalysisRepairUseCase.name);

    constructor(
        private readonly aiService: AiService,
        private readonly rerunService: CallAnalysisRerunService,
        private readonly smartRewrite: AgentAnalysisSmartRewriteService,
        private readonly store: CallAnalysisRepairStore,
        private readonly settingsService: CallReportSettingsService,
        private readonly orderResolver: LlmProviderOrderResolver,
        private readonly circuitBreaker: LlmCircuitBreakerService,
        private readonly queueDispatcher: QueueDispatcherService,
        private readonly callTypeRegistry: CallTypeRegistryService,
    ) {}

    async repairDomain(
        domain: string,
        now: Date = new Date(),
    ): Promise<CallAnalysisRepairResult> {
        const result: CallAnalysisRepairResult = {
            domain,
            skipped: null,
            repaired: 0,
            stillPartial: 0,
            requeued: 0,
            gaveUp: 0,
        };
        const settings = await this.settingsService.resolve(domain);
        if (!settings.enabled) {
            return { ...result, skipped: 'AI-конвейер портала выключен' };
        }
        const [primary] = await this.orderResolver.orderFor(domain);
        if (primary && (await this.circuitBreaker.isOpen(primary))) {
            return { ...result, skipped: `поставщик ${primary} на паузе` };
        }
        let quota = REPAIR_QUOTA_PER_DOMAIN;
        quota -= await this.requeueFailed(domain, now, quota, result);
        await this.repairPartial(
            domain,
            now,
            quota,
            settings.deepAnalysisModel ?? null,
            result,
        );
        return result;
    }

    /** Звонки без разбора — стадия анализа заново; возвращает, сколько поставлено. */
    private async requeueFailed(
        domain: string,
        now: Date,
        quota: number,
        result: CallAnalysisRepairResult,
    ): Promise<number> {
        let used = 0;
        const edge = now.getTime() - REPAIR_LOOKBACK_HOURS * HOUR_MS;
        for (const entry of await this.store.listFailed(domain)) {
            if (used >= quota) break;
            const { payload } = entry;
            const id = payload.transcriptionId;
            if (Date.parse(entry.failedAt) < edge) {
                await this.store.dropFailed(domain, id);
                continue;
            }
            const records = await this.aiService.findByTranscriptionIds([id]);
            if (records.some(record => record.type === AGENT_ANALYSIS_TYPE)) {
                await this.store.dropFailed(domain, id);
                continue;
            }
            const attempt = await this.store.bumpAttempt(id);
            await this.store.dropFailed(domain, id);
            if (attempt > REPAIR_MAX_ATTEMPTS) {
                result.gaveUp += 1;
                continue;
            }
            await this.queueDispatcher.dispatch(
                QueueNames.CALL_REPORT,
                JobNames.CALL_REPORT_ANALYZE,
                payload,
                `${buildDedupKey(domain, payload.activityId)}:analyze:repair-${attempt}`,
                REPAIR_ANALYZE_JOB_OPTS,
            );
            result.requeued += 1;
            used += 1;
        }
        return used;
    }

    /** Неполные разборы окна — переделать, пока не кончится квота. */
    private async repairPartial(
        domain: string,
        now: Date,
        quota: number,
        model: string | null,
        result: CallAnalysisRepairResult,
    ): Promise<void> {
        if (quota <= 0) return;
        const records = await this.aiService.findByDomainTypesInPeriod(
            domain,
            [AGENT_ANALYSIS_TYPE],
            new Date(now.getTime() - REPAIR_LOOKBACK_HOURS * HOUR_MS),
            now,
        );
        let used = 0;
        for (const candidate of selectRepairCandidates(records)) {
            if (used >= quota) break;
            const attempt =
                (await this.store.attempts(candidate.transcriptionId)) + 1;
            if (attempt > REPAIR_MAX_ATTEMPTS) continue;
            await this.store.bumpAttempt(candidate.transcriptionId);
            used += 1;
            const outcome = await this.repairOne(domain, candidate, model);
            if (outcome === 'repaired') result.repaired += 1;
            else if (attempt >= REPAIR_MAX_ATTEMPTS) result.gaveUp += 1;
            else result.stillPartial += 1;
        }
    }

    /** Один неполный разбор: переразбор и замена, только если новый полный. */
    private async repairOne(
        domain: string,
        candidate: RepairCandidate<AiEntityDto>,
        model: string | null,
    ): Promise<'repaired' | 'partial'> {
        const { transcriptionId, record } = candidate;
        try {
            const outcome = await this.rerunService.rerun({
                transcriptionId,
                source: record.user_result,
                model,
            });
            if (!outcome || (outcome.dto.incompleteParts ?? []).length > 0) {
                return 'partial';
            }
            const dto = prepareAgentAnalysis(
                transcriptionId,
                REANALYSIS_PROVIDER,
                outcome.dto,
                durationSecOf(outcome.row),
                this.logger,
            );
            const created = await this.aiService.create(
                buildReanalysisRecord({
                    row: outcome.row,
                    old: record,
                    dto,
                    versions: buildAnalysisVersions(
                        await this.registryHash(domain),
                        methodologyTagOf(dto),
                    ),
                    usage: outcome.usage,
                    model,
                }),
            );
            await this.aiService.update(record.id, {
                status: AI_RECORD_SUPERSEDED_STATUS,
            });
            const card = await this.smartRewrite.rewrite({
                id: created.id,
                transcription_id: created.transcription_id || null,
                user_result: created.user_result as unknown,
                provider: created.provider || null,
            });
            this.logger.log(
                `Догон разбора ${domain}, transcription ${transcriptionId}: ` +
                    `дособраны ${candidate.parts.join(', ')}; карточка — ${card.kind}`,
            );
            return 'repaired';
        } catch (error) {
            this.logger.warn(
                `Догон разбора ${domain}, transcription ${transcriptionId} не удался: ${(error as Error).message}`,
            );
            return 'partial';
        }
    }

    /** Хэш реестра типов — часть версий разбора; недоступен → builtin. */
    private async registryHash(domain: string): Promise<string> {
        try {
            const registry = await this.callTypeRegistry.resolve(domain);
            return buildRegistryHash(registry.codes);
        } catch {
            return CALL_REPORT_REGISTRY_BUILTIN;
        }
    }
}
