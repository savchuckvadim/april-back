import type { JobOptions } from 'bull';
import type { DealSendJobDto } from '../dto/deal-send-job.dto';

/**
 * Задание записи сделки: фронт ждёт его, опрашивая статус ограниченное
 * время, и при сбое отправляет запись в легаси (Laravel). Повторы — короткие,
 * чтобы уложиться в это окно: 2 с, 4 с.
 *
 * Готовые задания живут сутки (статус успевают опросить, Redis не растёт),
 * упавшие — неделю: по ним разбирают инциденты.
 */
export const DEAL_SEND_JOB_OPTIONS: Omit<JobOptions, 'jobId'> = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: { age: 24 * 60 * 60, count: 5_000 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
};

/** Ключ «последнего сохранения» живёт дольше упавших заданий (неделя). */
export const DEAL_SEND_LATEST_TTL_SEC = 7 * 24 * 60 * 60;

/**
 * Последнее сохранение сделки (или элемента смарта) — operationId. Задание,
 * которое не последнее, ничего не пишет: иначе повтор старого сохранения
 * после паузы или параллельный воркер перетёр бы более новые данные.
 */
export const dealSendLatestKey = (
    job: Pick<DealSendJobDto, 'domain' | 'dealId' | 'target'>,
): string =>
    job.target?.kind === 'smart'
        ? `konstructor:deal-send:latest:${job.domain}:smart:${job.target.entityTypeId}:${job.target.smartId}`
        : `konstructor:deal-send:latest:${job.domain}:deal:${job.dealId}`;

/** Текст ошибки Bitrix (axios: response.data) или обычной ошибки. */
export const describeDealSendError = (error: unknown): string => {
    const data = (error as { response?: { data?: unknown } })?.response?.data;
    if (data) return JSON.stringify(data);
    return error instanceof Error ? error.message : String(error);
};
