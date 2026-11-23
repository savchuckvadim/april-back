import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { RedisService } from '@/core/redis/redis.service';
import {
    EventSilentJobManagerData,
    EventSilentJobManagerHandler,
    HooksCollectedData,
    SILENCE_EVENT_PREFIX,
} from './event-silence.type';
import { delay } from '@/shared';

type KeyType = 'data' | 'lock' | 'job' | 'seq';

/** Окно тишины: пока хуки сыплются, lock продлевается; ждём столько без новых. */
export const SILENCE_WINDOW_MS = 1500;

/**
 * Срок жизни собранных хуков (data и seq) — страховка от мусора, а не рабочий
 * срок: штатно их забирает collectAndClear.
 *
 * Было 30 секунд, и хуки ПРОПАДАЛИ, если сборщик не успевал к окну за это
 * время: долгая пачка одного портала держала единственный сборщик, а данные
 * окна другого портала тем временем истекали (разбор 23.11.2026).
 */
export const SILENCE_DATA_TTL_MS = 3_600_000;

/**
 * Страж «одно задание на окно». Короткий намеренно: если задание потерялось
 * (сбой постановки), следующий хук того же ключа через 30 секунд поставит
 * новое и заберёт всё накопленное. Лишнее задание безвредно — оно соберёт
 * пустоту и выйдет.
 */
export const SILENCE_JOB_GUARD_TTL_MS = 30_000;

@Injectable()
export class EventSilentJobManagerService {
    private readonly silenceWindowMs = SILENCE_WINDOW_MS;
    private readonly dataTtlMs = SILENCE_DATA_TTL_MS;
    private readonly jobGuardTtlMs = SILENCE_JOB_GUARD_TTL_MS;
    // интервал опроса lock-ключа в waitUntilSilent
    private readonly pollIntervalMs = 500;
    private readonly logger = new Logger(EventSilentJobManagerService.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly queueDispatcher: QueueDispatcherService,
        private readonly eventEmitter: EventEmitter2,
    ) {}

    /**
     * Принимает входящий хук, кладёт его данные в Redis и (если ещё нет активного) ставит job на обработку.
     * Многократные вызовы в окне тишины — копят данные, но job ставится только один раз.
     */
    async handle<T>(item: EventSilentJobManagerData<T>): Promise<void> {
        const { keyPrefix, data, jobName } = item;
        const redis = this.redisService.getClient();

        const dataKey = this.getKey('data', keyPrefix);
        const lockKey = this.getKey('lock', keyPrefix);
        const jobKey = this.getKey('job', keyPrefix);
        const seqKey = this.getKey('seq', keyPrefix);

        // atомарный счётчик гарантирует уникальный field в hash при параллельных запросах
        const id = await redis.incr(seqKey);
        await redis.pexpire(seqKey, this.dataTtlMs);

        await redis.hset(dataKey, String(id), JSON.stringify(data));
        await redis.pexpire(dataKey, this.dataTtlMs);

        // lock продлевается каждым хуком — пока сыпятся, тишины нет
        await redis.set(lockKey, '1', 'PX', this.silenceWindowMs);

        // NX-guard: один job на одно окно. Удаляется в collectAndClear после сбора данных
        const wasSet = await redis.set(
            jobKey,
            '1',
            'PX',
            this.jobGuardTtlMs,
            'NX',
        );

        if (wasSet === 'OK') {
            await this.queueDispatcher.dispatch(
                QueueNames.EVENT_SILENT,
                jobName,
                item,
            );
        }
    }

    /**
     * Выполняется внутри Bull-воркера event-silent очереди.
     * Ждёт тишины → собирает накопленные данные → эмитит синхронное событие.
     */
    public async process<T>(item: EventSilentJobManagerData<T>): Promise<void> {
        const { keyPrefix, domain, jobName } = item;
        const lockKey = this.getKey('lock', keyPrefix);

        await this.waitUntilSilent(lockKey);

        const collected = await this.collectAndClear<T>(keyPrefix);
        if (Object.keys(collected).length === 0) {
            this.logger.log(`No data collected for ${jobName}, skipping`);
            return;
        }

        const handleData: EventSilentJobManagerHandler<T> = {
            collected,
            payload: { domain },
        };

        const eventName = `${SILENCE_EVENT_PREFIX}:${jobName}`;
        this.logger.log(
            `Emitting ${eventName} domain=${domain} items=${Object.keys(collected).length}`,
        );
        // emitAsync ждёт промисы слушателей, объявленных БЕЗ { async: true }:
        // с этим флагом EventEmitter2 зовёт слушателя через setImmediate и не
        // ждёт его (см. EVENT_SILENCE_GUIDE.md).
        await this.eventEmitter.emitAsync(eventName, handleData);
    }

    /**
     * Забрать хуки окна и освободить ключ — ОДНОЙ атомарной операцией
     * (MULTI: прочитать data, удалить data и job).
     *
     * Раньше это были три отдельные команды: хук, записанный между чтением и
     * удалением, пропадал, а при нескольких сборщиках одно и то же окно могли
     * бы забрать дважды. После MULTI новый хук ложится в свежий data-ключ и
     * ставит своё задание — оно соберёт следующее окно.
     *
     * jobKey удаляется ВСЕГДА, даже при пустом окне: иначе страж висел бы до
     * TTL и не давал поставить задание на следующие хуки.
     */
    private async collectAndClear<T>(
        keyPrefix: string,
    ): Promise<HooksCollectedData<T>> {
        const redis = this.redisService.getClient();
        const dataKey = this.getKey('data', keyPrefix);
        const jobKey = this.getKey('job', keyPrefix);
        const replies = await redis
            .multi()
            .hgetall(dataKey)
            .del(dataKey)
            .del(jobKey)
            .exec();

        const [readError, raw] = replies?.[0] ?? [null, null];
        if (readError) throw readError;
        if (!isStringRecord(raw)) return {};

        const data: HooksCollectedData<T> = {};
        for (const [field, value] of Object.entries(raw)) {
            data[field] = JSON.parse(value) as T;
        }
        return data;
    }

    private async waitUntilSilent(lockKey: string): Promise<void> {
        const redis = this.redisService.getClient();
        while (await redis.exists(lockKey)) {
            await delay(this.pollIntervalMs);
        }
    }

    private getKey(type: KeyType, keyPrefix: string): string {
        return `${keyPrefix}_${type}`;
    }
}

/** Ответ HGETALL: объект «поле → строка»; пустой хэш — пустой объект. */
const isStringRecord = (raw: unknown): raw is Record<string, string> =>
    typeof raw === 'object' &&
    raw !== null &&
    !Array.isArray(raw) &&
    Object.values(raw).every(value => typeof value === 'string');
