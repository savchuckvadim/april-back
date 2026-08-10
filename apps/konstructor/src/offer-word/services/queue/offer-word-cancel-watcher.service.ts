import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { offerWordEphemeralPdfCancelRedisKey } from '../../constants/offer-word-ephemeral-pdf.constants';

/** Как часто проверяем флаг отмены во время конвертации. */
const CANCEL_POLL_INTERVAL_MS = 2_000;

export type CancelWatch = {
    signal: AbortSignal;
    /** Остановить наблюдение — обязательно в finally, иначе течёт интервал. */
    stop: () => void;
};

/**
 * Следит за флагом отмены в Redis, пока идёт долгая генерация.
 *
 * Зачем: проверок «до» и «после» недостаточно — отменённая операция иначе
 * продолжает держать слот конвертации до самого конца (до 4 минут) и не
 * пускает туда живые задачи.
 */
@Injectable()
export class OfferWordCancelWatcher {
    private readonly logger = new Logger(OfferWordCancelWatcher.name);

    constructor(private readonly redisService: RedisService) {}

    watch(operationId: string): CancelWatch {
        const controller = new AbortController();
        const cancelKey = offerWordEphemeralPdfCancelRedisKey(operationId);
        const redis = this.redisService.getClient();

        const timer = setInterval(() => {
            void redis
                .get(cancelKey)
                .then(flag => {
                    if (!flag || controller.signal.aborted) {
                        return;
                    }
                    this.logger.log(
                        `Операция ${operationId} отменена — прерываю конвертацию`,
                    );
                    controller.abort();
                    clearInterval(timer);
                })
                .catch((error: Error) => {
                    // Недоступность Redis не должна ронять саму генерацию.
                    this.logger.warn(
                        `Не удалось проверить отмену ${operationId}: ${error.message}`,
                    );
                });
        }, CANCEL_POLL_INTERVAL_MS);
        // Интервал не должен держать процесс при завершении приложения.
        timer.unref?.();

        return {
            signal: controller.signal,
            stop: () => clearInterval(timer),
        };
    }
}
