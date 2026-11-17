import type { JobStatus } from 'bull';
import type { QueueDispatcherService, QueueNames } from '@lib/queue';

/** Состояния джоба, при которых работа ещё впереди или идёт. */
const PENDING_STATES: ReadonlySet<JobStatus | 'stuck'> = new Set<
    JobStatus | 'stuck'
>(['waiting', 'delayed', 'active', 'paused']);

/**
 * Джоб с этим id ещё ждёт или идёт. Завершённый остаток (если Bull не
 * успел его убрать) снимается — иначе jobId занят и новый не встанет.
 */
export async function isQueueJobPending(
    dispatcher: QueueDispatcherService,
    queue: QueueNames,
    jobId: string,
): Promise<boolean> {
    const job = await dispatcher.getJob(queue, jobId);
    if (!job) return false;
    if (PENDING_STATES.has(await job.getState())) return true;
    await job.remove().catch(() => undefined);
    return false;
}
