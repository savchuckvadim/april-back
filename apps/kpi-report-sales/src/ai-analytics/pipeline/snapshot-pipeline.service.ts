import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueueConcurrencyService } from '@/modules/queue';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import {
    AI_PIPELINE_LOCK_KEY,
    AI_PIPELINE_MAX_PER_DOMAIN,
    AI_PIPELINE_MAX_SLOT_RETRIES,
    AI_PIPELINE_RETRY_DELAY_MS,
    AiPipelineRhythm,
    isAiPipelineRhythm,
} from '../constants/ai-snapshot.const';
import {
    AiPipelineRunSummary,
    AiSnapshotJobData,
} from '../dto/ai-snapshot.dto';
import {
    AI_ANALYTICS_PIPELINE_STEPS,
    AiAnalyticsPipelineStep,
    AiPipelineJobLike,
    AiPipelineStepContext,
    AiPipelineStepResult,
    AiSnapshotRunner,
    createStepBus,
    stepFailed,
} from '../steps/step.types';
import { EtlRunWriter } from './etl-run.writer';
import { AiPipelineRunContextFactory } from './run-context.factory';

/** Шаги прогона и первая ошибка (дальше конвейер не идёт). */
interface StepsRun {
    results: AiPipelineStepResult[];
    error: Error | null;
}

/**
 * Раннер ночного конвейера снапшотов (план Фазы 2, поток 12). Один прогон:
 * слот портала → контекст (ритм, ключи периода, TZ, календарь, настройки,
 * реестр параметров, версии, ростер) → шаги ритма с общей шиной значений →
 * журнал `ai-analytics-etl-run` с метриками → освобождение слота.
 *
 * Нельзя нарушать: слот занят → перекладка и НИ ОДИН шаг не выполняется;
 * пропуск шага не останавливает конвейер («частично» в журнале); падение
 * останавливает, но журнал пишется и исключение пробрасывается; шаги
 * инжектятся токеном (иначе срезы замкнулись бы в цикл); `@Injectable` без
 * bitrix-состояния — инстанс Битрикс берут сами шаги (PBXService.init).
 */
@Injectable()
export class SnapshotPipelineService implements AiSnapshotRunner {
    private readonly logger = new Logger(SnapshotPipelineService.name);

    constructor(
        private readonly context: AiPipelineRunContextFactory,
        private readonly concurrency: QueueConcurrencyService,
        private readonly etlRun: EtlRunWriter,
        @Inject(AI_ANALYTICS_PIPELINE_STEPS)
        private readonly steps: readonly AiAnalyticsPipelineStep[],
    ) {}

    /** Один прогон конвейера по данным джобы. */
    async run(
        job: AiPipelineJobLike,
        now: Date = new Date(),
    ): Promise<AiPipelineRunSummary> {
        const { domain, kind } = job.data;
        if (!isAiPipelineRhythm(kind)) {
            throw new Error(`Вид джобы «${kind}» не ритм конвейера`);
        }
        const slot = await this.concurrency.acquire({
            queue: QueueNames.SALES_KPI_REPORT,
            domain,
            entityKey: AI_PIPELINE_LOCK_KEY,
            maxPerDomain: AI_PIPELINE_MAX_PER_DOMAIN,
        });
        if (!slot.acquired) return this.requeue(job, kind, slot.reason);
        try {
            return await this.execute(job.data, kind, now);
        } finally {
            await slot.release();
        }
    }

    /** Контекст → шаги → журнал; падение шага пробрасывается после журнала. */
    private async execute(
        data: AiSnapshotJobData,
        rhythm: AiPipelineRhythm,
        now: Date,
    ): Promise<AiPipelineRunSummary> {
        const startedAt = Date.now();
        const { ctx, warnings } = await this.context
            .build(data, rhythm, now)
            .catch(async (error: Error) => {
                const day = data.day ?? now.toISOString().slice(0, 10);
                await this.etlRun.writeContextFailure(
                    { domain: data.domain, day, rhythm },
                    error,
                    now.toISOString(),
                );
                this.logger.error(
                    `Контекст конвейера ${data.domain} не собран: ${error.message}`,
                    { telegram: true, domain: data.domain },
                );
                throw error;
            });
        const { results, error } = await this.runSteps(
            ctx,
            this.selectSteps(rhythm, data.steps),
        );
        const summary = await this.journal(
            ctx,
            results,
            Date.now() - startedAt,
            warnings,
        );
        if (error) throw error;
        return summary;
    }

    /** Шаги ритма в порядке регистрации; белый список джобы сужает набор. */
    private selectSteps(
        rhythm: AiPipelineRhythm,
        only?: readonly string[],
    ): AiAnalyticsPipelineStep[] {
        return this.steps.filter(
            step =>
                step.rhythms.includes(rhythm) &&
                (!only?.length || only.includes(step.code)),
        );
    }

    /**
     * Последовательный прогон: пропуск не мешает следующим шагам, падение
     * прекращает прогон (соседи считают по пустой шине — смысла нет).
     */
    private async runSteps(
        ctx: AiPipelineStepContext,
        steps: readonly AiAnalyticsPipelineStep[],
    ): Promise<StepsRun> {
        const bus = createStepBus();
        const results: AiPipelineStepResult[] = [];
        for (const step of steps) {
            const startedAt = Date.now();
            try {
                const result = await step.run(ctx, bus);
                results.push(result);
                if (result.status !== 'failed') continue;
                return { results, error: new Error(stepError(result)) };
            } catch (error) {
                const ms = Date.now() - startedAt;
                const reason = (error as Error).message;
                results.push(stepFailed(step.code, reason, { ms }));
                return { results, error: error as Error };
            }
        }
        return { results, error: null };
    }

    /**
     * Журнал прогона (он же метрики) + телеграм при падении. Оговорки
     * сбора контекста (календарь) и предупреждения шагов (санити-панель
     * §4.11) уезжают в `warnings` записи журнала.
     */
    private async journal(
        ctx: AiPipelineStepContext,
        results: readonly AiPipelineStepResult[],
        durationMs: number,
        warnings: readonly string[] = [],
    ): Promise<AiPipelineRunSummary> {
        const written = await this.etlRun.write({
            domain: ctx.domain,
            day: ctx.day,
            rhythm: ctx.rhythm,
            calcVersion: ctx.calcVersion,
            paramsVersion: ctx.paramsVersion,
            inputsHash: ctx.inputsHash,
            generatedAt: ctx.now.toISOString(),
            durationMs,
            steps: results,
            warnings: [...warnings, ...stepWarnings(results)],
        });
        const { status, steps } = written.payload;
        if (status === 'failed') {
            this.logger.error(
                `Конвейер ${ctx.domain} ${ctx.day} (${ctx.rhythm}) упал`,
                { telegram: true, domain: ctx.domain },
            );
        }
        return {
            domain: ctx.domain,
            rhythm: ctx.rhythm,
            day: ctx.day,
            status,
            steps,
            etlRunId: written.id,
            durationMs,
        };
    }

    /**
     * Слот занят — джоба уезжает в конец очереди с задержкой, шаги не
     * выполняются. jobId новой джобе не задаём: Bull отказал бы повтору.
     */
    private async requeue(
        job: AiPipelineJobLike,
        rhythm: AiPipelineRhythm,
        reason: string | undefined,
    ): Promise<AiPipelineRunSummary> {
        const { domain, day } = job.data;
        const retries = (job.data.slotRetries ?? 0) + 1;
        const exhausted = retries > AI_PIPELINE_MAX_SLOT_RETRIES;
        if (exhausted) {
            this.logger.error(
                `Конвейер ${domain}: слот не освободился за ${AI_PIPELINE_MAX_SLOT_RETRIES} попыток (${reason})`,
                { telegram: true, domain },
            );
        } else {
            this.logger.log(
                `Конвейер ${domain}: слот занят (${reason}), перекладка #${retries}`,
            );
            await job.queue.add(
                JobNames.SALES_AI_ANALYTICS_SNAPSHOT,
                { ...job.data, slotRetries: retries },
                {
                    delay: AI_PIPELINE_RETRY_DELAY_MS,
                    removeOnComplete: true,
                    removeOnFail: true,
                },
            );
        }
        return {
            domain,
            rhythm,
            day: day ?? '',
            status: 'requeued',
            steps: [],
            etlRunId: null,
            durationMs: 0,
            reason: exhausted
                ? 'slot-retries-exhausted'
                : (reason ?? 'slot-busy'),
        };
    }
}

/** Текст исключения по упавшему шагу (шаг вернул failed без throw). */
function stepError(result: AiPipelineStepResult): string {
    return `Шаг «${result.step}»: ${result.reason ?? 'без причины'}`;
}

/**
 * Предупреждения шагов: расширенный результат (санити-панель §4.11) везёт
 * их полем `warnings`. Раннер о конкретных шагах не знает — читает поле
 * структурно и отбрасывает чужую форму.
 */
function stepWarnings(results: readonly AiPipelineStepResult[]): string[] {
    return results.flatMap(result =>
        'warnings' in result && Array.isArray(result.warnings)
            ? result.warnings.filter(
                  (warning): warning is string => typeof warning === 'string',
              )
            : [],
    );
}
