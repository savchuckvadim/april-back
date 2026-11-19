import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { YandexSubmissionStatsRepository } from '../repository/yandex-submission-stats.repository';
import type { YandexChannelCount } from '../services/streaming-transcription.service';
import {
    YandexCallBusyError,
    YandexSubmitLimitError,
} from './yandex-submission.errors';

/** Звонок для стража: ключ, портал, подпись для логов и длительность. */
export interface YandexCallRef {
    /** Ключ звонка: dedupKey конвейера; старый путь — ключ записи в Object Storage. */
    key: string;
    domain: string;
    /** Как звонок называть в логах и тревоге. */
    label: string;
    /** Длительность по телефонии, секунд — для счётчика расхода. */
    durationSec?: number;
}

/** Операция Яндекса, сохранённая сразу после отправки. */
export interface YandexStoredOperation {
    operationId: string;
    channels: YandexChannelCount;
    /** Ключ записи в Object Storage — удалить после ответа Яндекса. */
    objectKey: string | null;
}

/** Не больше стольких отправок одного звонка в Яндекс за окно. */
export const YANDEX_SUBMIT_LIMIT = 3;
export const YANDEX_SUBMIT_WINDOW_SEC = 72 * 3600;
/** Сколько помним номер операции: Яндекс хранит результат 3 суток. */
export const YANDEX_OPERATION_TTL_SEC = 24 * 3600;
/** Замок звонка: срок без продления и шаг продления. */
export const YANDEX_LOCK_TTL_SEC = 600;
const LOCK_RENEW_MS = 120_000;

const PREFIX = 'yandex-stt';
export const yandexGuardKeys = {
    lock: (call: string): string => `${PREFIX}:lock:${call}`,
    sends: (call: string): string => `${PREFIX}:sends:${call}`,
    limitAlert: (call: string): string => `${PREFIX}:limit-alert:${call}`,
    operation: (call: string): string => `${PREFIX}:operation:${call}`,
} as const;

/** Снять замок, только если он наш: сравнить и удалить одним шагом. */
const RELEASE_IF_OWNER = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
/** Продлить замок, только если он наш. */
const RENEW_IF_OWNER = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end`;
/** Счётчик попыток: +1, срок окна ставится первой попыткой — одним шагом. */
const INCR_IN_WINDOW = `local n = redis.call('incr', KEYS[1]) if n == 1 then redis.call('expire', KEYS[1], ARGV[1]) end return n`;

const parseStored = (raw: string | null): YandexStoredOperation | null => {
    if (!raw) return null;
    try {
        const value = JSON.parse(raw) as Partial<YandexStoredOperation>;
        if (typeof value.operationId !== 'string' || !value.operationId) {
            return null;
        }
        return {
            operationId: value.operationId,
            channels: value.channels === 2 ? 2 : 1,
            objectKey:
                typeof value.objectKey === 'string' ? value.objectKey : null,
        };
    } catch {
        return null;
    }
};

/**
 * Страж платных отправок в Яндекс SpeechKit (19.11.2026: один звонок
 * уходил в Яндекс по нескольку раз — ретраи Bull, таймауты, повторные
 * сканы, — а каждая операция оплачивается). Через него идёт КАЖДАЯ
 * отправка, все состояния — в Redis, общие для процессов:
 * - замок звонка на время распознавания (с продлением): второй запуск
 *   того же звонка не отправляет его, а получает отказ;
 * - лимит: не больше {@link YANDEX_SUBMIT_LIMIT} отправок звонка за 72 ч,
 *   дальше отказ и одна тревога в Telegram на звонок;
 * - номер операции сразу после отправки (24 ч): повторный запуск
 *   продолжает ждать её, а не платит заново;
 * - счётчик отправок по порталу и дню для страницы расхода.
 */
@Injectable()
export class YandexSubmissionGuard {
    private readonly logger = new Logger(YandexSubmissionGuard.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly stats: YandexSubmissionStatsRepository,
    ) {}

    /** Выполнить `work` под замком звонка; замок занят — YandexCallBusyError. */
    async withCallLock<T>(
        call: YandexCallRef,
        work: () => Promise<T>,
    ): Promise<T> {
        const redis = this.redisService.getClient();
        const key = yandexGuardKeys.lock(call.key);
        const token = randomUUID();
        const taken = await redis.set(
            key,
            token,
            'EX',
            YANDEX_LOCK_TTL_SEC,
            'NX',
        );
        if (taken === null) throw new YandexCallBusyError(call.label);

        const renewal = setInterval(
            () => void this.renewLock(key, token, call),
            LOCK_RENEW_MS,
        );
        renewal.unref();
        try {
            return await work();
        } finally {
            clearInterval(renewal);
            await redis
                .eval(RELEASE_IF_OWNER, 1, key, token)
                .catch((error: Error) =>
                    this.logger.warn(
                        `Замок звонка ${call.label} не снят: ${error.message} — истечёт сам`,
                    ),
                );
        }
    }

    /** Сохранённая операция звонка или null. */
    async storedOperation(
        call: YandexCallRef,
    ): Promise<YandexStoredOperation | null> {
        const raw = await this.redisService
            .getClient()
            .get(yandexGuardKeys.operation(call.key));
        return parseStored(raw);
    }

    /** Забыть операцию: Яндекс её не знает или она завершилась ошибкой. */
    async forgetOperation(call: YandexCallRef): Promise<void> {
        await this.redisService
            .getClient()
            .del(yandexGuardKeys.operation(call.key));
    }

    /**
     * Отправка в пределах лимита: попытка учитывается ДО отправки (сбой
     * отправки тоже попытка), номер принятой операции сохраняется сразу.
     * После того как Яндекс принял запись, страж не бросает ошибок —
     * ошибка записи номера или счётчика только в журнал.
     */
    async submit(
        call: YandexCallRef,
        spec: Omit<YandexStoredOperation, 'operationId'>,
        send: () => Promise<string>,
    ): Promise<string> {
        const attempt = await this.reserveAttempt(call);
        const operationId = await send();
        const stored: YandexStoredOperation = { operationId, ...spec };
        await this.redisService
            .getClient()
            .set(
                yandexGuardKeys.operation(call.key),
                JSON.stringify(stored),
                'EX',
                YANDEX_OPERATION_TTL_SEC,
            )
            .catch((error: Error) =>
                this.logger.warn(
                    `Номер операции ${operationId} (${call.label}) не сохранён: ${error.message}`,
                ),
            );
        await this.stats
            .record(call.domain, call.durationSec ?? 0)
            .catch((error: Error) =>
                this.logger.warn(
                    `Отправка ${call.label} не учтена в счётчике расхода: ${error.message}`,
                ),
            );
        this.logger.log(
            `Яндекс принял операцию ${operationId} для ${call.label} ` +
                `(${call.durationSec ?? '?'} с, попытка ${attempt} из ${YANDEX_SUBMIT_LIMIT})`,
        );
        return operationId;
    }

    /** Номер попытки; лимит исчерпан — тревога (одна на звонок) и отказ. */
    private async reserveAttempt(call: YandexCallRef): Promise<number> {
        const redis = this.redisService.getClient();
        const attempt = Number(
            await redis.eval(
                INCR_IN_WINDOW,
                1,
                yandexGuardKeys.sends(call.key),
                YANDEX_SUBMIT_WINDOW_SEC,
            ),
        );
        if (attempt <= YANDEX_SUBMIT_LIMIT) return attempt;

        const windowHours = YANDEX_SUBMIT_WINDOW_SEC / 3600;
        const error = new YandexSubmitLimitError(
            call.label,
            YANDEX_SUBMIT_LIMIT,
            windowHours,
        );
        const firstAlert = await redis
            .set(
                yandexGuardKeys.limitAlert(call.key),
                '1',
                'EX',
                YANDEX_SUBMIT_WINDOW_SEC,
                'NX',
            )
            .catch(() => 'OK' as const);
        if (firstAlert !== null) {
            this.logger.warn(
                `Звонок ${call.label} (${call.domain}) отправлялся в Яндекс ` +
                    `${YANDEX_SUBMIT_LIMIT} раза за ${windowHours} ч — остановлено, нужна проверка`,
                { telegram: true, domain: call.domain, call: call.key },
            );
        } else {
            this.logger.warn(error.message);
        }
        throw error;
    }

    private async renewLock(
        key: string,
        token: string,
        call: YandexCallRef,
    ): Promise<void> {
        try {
            const renewed = await this.redisService
                .getClient()
                .eval(RENEW_IF_OWNER, 1, key, token, YANDEX_LOCK_TTL_SEC);
            if (renewed !== 1) {
                this.logger.warn(
                    `Замок звонка ${call.label} потерян — его может взять другой запуск`,
                );
            }
        } catch (error) {
            this.logger.warn(
                `Замок звонка ${call.label} не продлён: ${(error as Error).message}`,
            );
        }
    }
}
