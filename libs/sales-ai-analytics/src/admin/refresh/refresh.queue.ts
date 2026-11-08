import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import type { AiRefreshTickJobData } from './refresh.types';

/** Тик — одна попытка: следующий ставит сам воркер, сбой не копится. */
const TICK_JOB_OPTIONS = {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
} as const;

/** jobId тика: портал, сценарий и номер — повтор того же тика не дублируется. */
export const aiRefreshTickJobId = (data: AiRefreshTickJobData): string =>
    `ai-refresh:${data.domain}:${data.scenarioId}:${data.seq}`;

/** Поставить тик сценария с задержкой в очередь AI_ANALYTICS_ADMIN. */
export async function dispatchAiRefreshTick(
    dispatcher: QueueDispatcherService,
    data: AiRefreshTickJobData,
    delayMs: number,
): Promise<void> {
    await dispatcher.dispatch<AiRefreshTickJobData>(
        QueueNames.AI_ANALYTICS_ADMIN,
        JobNames.SALES_AI_ANALYTICS_REFRESH_TICK,
        data,
        aiRefreshTickJobId(data),
        { ...TICK_JOB_OPTIONS, delay: Math.max(0, delayMs) },
    );
}
