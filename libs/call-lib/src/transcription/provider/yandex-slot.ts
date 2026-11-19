import { Semaphore } from '@lib/shared/lib/utils/semaphore.util';
import { YandexSlotTimeoutError } from './yandex-submission.errors';

/**
 * Слот Яндекса в процессе: не больше `limit` распознаваний одновременно
 * (env TRANSCRIPTION_YANDEX_CONCURRENCY), а ждать слота — не дольше
 * `waitMs` (env TRANSCRIPTION_YANDEX_SLOT_WAIT_MS; 0 — без предела).
 * Предел ожидания нужен, чтобы всё ожидание Яндекса укладывалось в
 * таймаут задания Bull (yandex-stt-budget.util): иначе Bull начинал вторую
 * попытку, пока первая ещё стояла в очереди за слотом.
 */
export class YandexSlot {
    private readonly limiter: Semaphore;

    constructor(
        limit: number,
        private readonly waitMs: number,
    ) {
        this.limiter = new Semaphore(limit);
    }

    /**
     * Выполнить `work` в слоте. Не дождались слота — YandexSlotTimeoutError;
     * сама работа после этого уже не начнётся, даже когда слот освободится.
     */
    run<T>(work: () => Promise<T>, label: string): Promise<T> {
        if (this.waitMs <= 0) return this.limiter.run(work);
        let expired = false;
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                expired = true;
                reject(new YandexSlotTimeoutError(label, this.waitMs));
            }, this.waitMs);
            timer.unref();
        });
        const inSlot = this.limiter.run(() => {
            clearTimeout(timer);
            return expired
                ? Promise.reject(new YandexSlotTimeoutError(label, this.waitMs))
                : work();
        });
        return Promise.race([inSlot, timeout]);
    }
}
