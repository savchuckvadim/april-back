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

@Injectable()
export class EventSilentJobManagerService {
    // окно тишины: пока хуки сыплются — продлеваем lock, ждём этого таймаута без активности
    private readonly silenceWindowMs = 1500;
    // TTL для данных/jobKey: запас на случай задержки воркера; safety net, явно чистится в collectAndClear
    private readonly dataTtlMs = 30_000;
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
        const wasSet = await redis.set(jobKey, '1', 'PX', this.dataTtlMs, 'NX');

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
        // emitAsync ждёт async-listener'ов (помеченных { async: true } в @OnEvent)
        await this.eventEmitter.emitAsync(eventName, handleData);
    }

    private async collectAndClear<T>(
        keyPrefix: string,
    ): Promise<HooksCollectedData<T>> {
        const redis = this.redisService.getClient();
        const dataKey = this.getKey('data', keyPrefix);
        const jobKey = this.getKey('job', keyPrefix);
        const raw = await redis.hgetall(dataKey);

        // jobKey удаляем ВСЕГДА: даже при пустом hgetall — иначе guard висит до TTL
        // и блокирует постановку новых job'ов на следующие хуки
        if (!raw || Object.keys(raw).length === 0) {
            await redis.del(jobKey);
            return {};
        }

        // удаляем оба ключа ДО emit'a handleHooks — это разрешает
        // новым хукам сразу поставить следующий job, который встанет за текущим
        // в Bull (concurrency=1) и обработается последовательно после
        await redis.del(dataKey);
        await redis.del(jobKey);

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
