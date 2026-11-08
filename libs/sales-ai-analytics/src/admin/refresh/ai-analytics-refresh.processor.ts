import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import { dispatchAiRefreshTick } from './refresh.queue';
import { AiRefreshTickUseCase } from './refresh-tick.use-case';
import {
    AI_REFRESH_DEFAULTS,
    type AiRefreshTickJobData,
} from './refresh.types';

/** Сутки тиков раз в минуту — дальше сценарий не тянем. */
const MAX_TICKS = 24 * 60;

/**
 * Воркер сценария «обновить всё по порядку» — ТОЛЬКО в apps/admin, своя
 * очередь AI_ANALYTICS_ADMIN (общий SALES_KPI_REPORT здесь слушать нельзя:
 * Bull уронит джобы без обработчика). Тик двигает сценарий и ставит
 * следующий; сбой тика не обрывает сценарий — следующий тик повторит.
 */
@Processor(QueueNames.AI_ANALYTICS_ADMIN)
export class AiRefreshProcessor {
    private readonly logger = new Logger(AiRefreshProcessor.name);

    constructor(
        private readonly tick: AiRefreshTickUseCase,
        private readonly dispatcher: QueueDispatcherService,
    ) {}

    @Process(JobNames.SALES_AI_ANALYTICS_REFRESH_TICK)
    async handle(job: Job<AiRefreshTickJobData>): Promise<void> {
        const data = job.data;
        let more = true;
        try {
            more = await this.tick.tick(data);
        } catch (error) {
            this.logger.warn(
                `Тик сценария ${data.domain} не прошёл: ${(error as Error).message}`,
            );
        }
        if (!more) return;
        if (data.seq + 1 >= MAX_TICKS) {
            this.logger.warn(
                `Сценарий ${data.domain} идёт больше суток — тики остановлены`,
            );
            return;
        }
        await dispatchAiRefreshTick(
            this.dispatcher,
            { ...data, seq: data.seq + 1 },
            AI_REFRESH_DEFAULTS.tickDelayMs,
        );
    }
}
