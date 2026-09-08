import { Injectable, Logger } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    SnapshotEnvelope,
} from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_CALC_VERSION } from '../constants/ai-overview.const';
import {
    AI_PIPELINE_CORE_STEP_CODES,
    AI_PIPELINE_METRIC,
    AiPipelineJournalStatus,
    AiPipelineMetricName,
    AiPipelineRhythm,
} from '../constants/ai-snapshot.const';
import { AiEtlRunPayload, AiEtlStepRecord } from '../dto/ai-snapshot.dto';
import { AiPipelineStepResult, stepFailed } from '../steps/step.types';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { AiAnalyticsPipelineMetrics } from './ai-analytics.metrics';

/** Что записать в журнал прогона (собирает раннер). */
export interface EtlRunWriteInput {
    domain: string;
    /** День прогона 'YYYY-MM-DD' в TZ портала — он же ключ записи. */
    day: string;
    rhythm: AiPipelineRhythm;
    calcVersion: string;
    paramsVersion: string;
    inputsHash: string;
    /** Момент формирования, ISO (UTC). */
    generatedAt: string;
    /** Суммарная длительность прогона, мс (включая сбор контекста). */
    durationMs: number;
    steps: readonly AiPipelineStepResult[];
    /** Предупреждения прогона (санити-панель, календарь). */
    warnings?: readonly string[];
}

/** Итог записи журнала: id записи, замещённые и сама нагрузка. */
export interface EtlRunWriteResult {
    id: string;
    supersededIds: string[];
    payload: AiEtlRunPayload;
}

/**
 * Наблюдаемость прогона конвейера: журнал в снапшот `ai-analytics-etl-run`
 * (план §3.1, зерно portal-day, ключ — день прогона в TZ портала, менеджера
 * нет) и те же четыре величины в метрики Prometheus. Обе записи делаются
 * из одного посчитанного payload — расхождения между графиком и журналом
 * быть не может.
 *
 * Повтор за ту же дату снапшотов не плодит: upsert стора переводит прежнюю
 * запись ключа в `superseded` и пишет новую `done`. Дрейф входов считается
 * сравнением inputsHash с последним прогоном (своей записи там ещё нет).
 */
@Injectable()
export class EtlRunWriter {
    private readonly logger = new Logger(EtlRunWriter.name);

    constructor(
        private readonly snapshots: AiAnalyticsSnapshotStore,
        private readonly metrics: AiAnalyticsPipelineMetrics,
    ) {}

    async write(input: EtlRunWriteInput): Promise<EtlRunWriteResult> {
        const payload = await this.buildPayload(input);
        const envelope: SnapshotEnvelope<AiEtlRunPayload> = {
            domain: input.domain,
            type: AI_ANALYTICS_SNAPSHOT_TYPE.etlRun,
            periodKey: input.day,
            managerId: null,
            calcVersion: input.calcVersion,
            paramsVersion: input.paramsVersion,
            inputsHash: input.inputsHash,
            generatedAt: input.generatedAt,
            payload,
        };
        const { id, supersededIds } = await this.snapshots.upsert(envelope);
        this.metrics.observeRun(input.rhythm, payload.status, payload.metrics);
        this.logger.log(
            `Журнал прогона ${input.domain} ${input.day} (${input.rhythm}): ` +
                `${payload.status}, шагов ${payload.steps.length}, ` +
                `${payload.rowsLoaded} строк, ${payload.bitrixCalls} вызовов Битрикс`,
        );
        return { id, supersededIds, payload };
    }

    /**
     * Контекст прогона не собрался (нет настроек, недоступен ростер):
     * журнал с одним синтетическим шагом `context`, чтобы портал с битой
     * конфигурацией был виден в наблюдаемости, а не пропадал молча.
     * Ошибка самой записи гасится — она не должна съесть причину падения.
     */
    async writeContextFailure(
        input: Pick<EtlRunWriteInput, 'domain' | 'day' | 'rhythm'>,
        error: Error,
        generatedAt: string,
    ): Promise<void> {
        const step = stepFailed(
            AI_PIPELINE_CORE_STEP_CODES.context,
            error.message,
        );
        await this.write({
            ...input,
            calcVersion: AI_ANALYTICS_CALC_VERSION,
            paramsVersion: '',
            inputsHash: '',
            generatedAt,
            durationMs: 0,
            steps: [step],
        }).catch(() => undefined);
    }

    /** Нагрузка журнала: шаги, суммы, дрейф входов и метрики прогона. */
    private async buildPayload(
        input: EtlRunWriteInput,
    ): Promise<AiEtlRunPayload> {
        const steps = input.steps.map(toStepRecord);
        const sum = (pick: (step: AiPipelineStepResult) => number): number =>
            input.steps.reduce((total, step) => total + pick(step), 0);
        const rowsLoaded = sum(step => step.rows);
        const bitrixCalls = sum(step => step.bitrixCalls);
        return {
            day: input.day,
            rhythm: input.rhythm,
            status: runStatus(steps),
            steps,
            durationMs: input.durationMs,
            rowsLoaded,
            bitrixCalls,
            inputsDrift: await this.hasDrift(input),
            warnings: [...(input.warnings ?? [])],
            metrics: {
                [AI_PIPELINE_METRIC.jobDuration]: input.durationMs / 1000,
                [AI_PIPELINE_METRIC.rowsLoaded]: rowsLoaded,
                [AI_PIPELINE_METRIC.bitrixCalls]: bitrixCalls,
                [AI_PIPELINE_METRIC.llmPrice]: sum(step => step.llmPrice ?? 0),
            } satisfies Record<AiPipelineMetricName, number>,
        };
    }

    /**
     * Входы поехали, если хэш отличается от последнего записанного
     * прогона портала. Первый прогон дрейфом не считается. Ошибка чтения
     * истории не роняет журнал — дрейф остаётся неизвестным (false).
     */
    private async hasDrift(input: EtlRunWriteInput): Promise<boolean> {
        try {
            const previous = await this.snapshots.latest(
                input.domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.etlRun,
                null,
            );
            if (!previous) return false;
            return previous.inputsHash !== input.inputsHash;
        } catch (error) {
            this.logger.warn(
                `Дрейф входов ${input.domain} не проверен: ${(error as Error).message}`,
            );
            return false;
        }
    }
}

/** Результат шага → запись журнала (контракт EtlStepResult библиотеки). */
function toStepRecord(step: AiPipelineStepResult): AiEtlStepRecord {
    return {
        step: step.step,
        status: step.status,
        durationMs: step.ms,
        rowsLoaded: step.rows,
        bitrixCalls: step.bitrixCalls,
        written: step.written,
        reason: step.reason ?? null,
        error: step.status === 'failed' ? (step.reason ?? 'unknown') : null,
    };
}

/** Падение важнее пропуска: failed → partial → ok. */
function runStatus(steps: readonly AiEtlStepRecord[]): AiPipelineJournalStatus {
    if (steps.some(step => step.status === 'failed')) return 'failed';
    if (steps.some(step => step.status === 'skipped')) return 'partial';
    return 'ok';
}
