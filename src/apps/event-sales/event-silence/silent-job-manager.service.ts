// core/silence/silent-job-manager.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { QueueDispatcherService } from 'src/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from 'src/modules/queue/constants/queue-names.enum';
import { RedisService } from '@/core/redis/redis.service';
import {
    EventSilentJobManagerData,
    EventSilentJobManagerHandler,
    HooksCollectedData,
} from './event-silence.type';
import { delay } from '@/shared';

@Injectable()
export class EventSilentJobManagerService {
    private readonly ttlMs = 1500; // время жизни данных в redis - через сколько накопление данных перестает работать после последнего добавления по ключу
    private readonly logger = new Logger(EventSilentJobManagerService.name);
    private readonly handlerRegistry = new Map<
        string,
        (data: EventSilentJobManagerHandler<unknown>) => Promise<void>
    >();

    constructor(
        private readonly redisService: RedisService,
        private readonly queueDispatcher: QueueDispatcherService,
    ) {
        this.logger.log('Event SilentJobManagerService initialized');
    }

    registerHandler<T>(
        jobName: string,
        handler: (data: EventSilentJobManagerHandler<T>) => Promise<void>,
    ): void {
        this.handlerRegistry.set(
            jobName,
            handler as (data: EventSilentJobManagerHandler<unknown>) => Promise<void>,
        );
        this.logger.log(`Handler registered for job: ${jobName}`);
    }

    async handle<T>(ddosItem: EventSilentJobManagerData<T>) {
        const { keyPrefix, data, jobName } = ddosItem;
        this.logger.log(`Handling job ${jobName} with key prefix ${keyPrefix}`);
        const redis = this.redisService.getClient();
        console.log('SilentJobManagerService handle redis');

        const key = this.getKey('data', keyPrefix);
        const lockKey = this.getKey('lock', keyPrefix);
        const jobKey = this.getKey('job', keyPrefix);

        const id = Date.now();
        const existingRaw = await redis.get(key);
        const current: HooksCollectedData<T> = existingRaw
            ? (JSON.parse(existingRaw) as HooksCollectedData<T>)
            : ({} as HooksCollectedData<T>);
        current[id] = data;

        // this.logger.log(`Current data: ${JSON.stringify(current)}`);

        await redis.set(key, JSON.stringify(current));
        await redis.set(lockKey, '1', 'PX', this.ttlMs);

        // счетчик для ограничения количества запусков. цель - сбросить тишину при 50 запросах
        const counterKey = `${keyPrefix}_counter`;
        await redis.incr(counterKey);
        await redis.expire(counterKey, Math.ceil(this.ttlMs / 1000)); // expire, чтоб не жило вечно

        // console.log('current');

        // console.log(current);

        const alreadyQueued = await redis.get(jobKey);
        this.logger.log(`Job already queued: ${!!alreadyQueued}`);

        if (!alreadyQueued) {
            this.logger.log('Queueing new job');
            await redis.set(jobKey, '1', 'EX', 10);
            await this.queueDispatcher.dispatch(
                QueueNames.EVENT_SILENT,
                jobName,
                ddosItem,
            );
        }
    }
    // выполняется из очереди
    public async process<T>(
        ddosItem: EventSilentJobManagerData<T>,
    ): Promise<void> {
        const { keyPrefix, domain } = ddosItem;
        const lockKey = `${keyPrefix}_lock`;

        // ждем пока не освободится ключ
        await this.waitUntilSilent(lockKey);

        // получаем накопленные данные
        const collected = await this.collectAndClear<T>(keyPrefix);
        const handleData: EventSilentJobManagerHandler<T> = {
            collected,
            payload: { domain },
        };
        this.logger.log(`Handle data: ${JSON.stringify(handleData)}`);
        const registeredHandler = this.handlerRegistry.get(ddosItem.jobName);
        if (!registeredHandler) {
            this.logger.error(`No handler registered for job: ${ddosItem.jobName}`);
            return;
        }
        await registeredHandler(handleData);
    }

    private async collectAndClear<T>(
        keyPrefix: string,
    ): Promise<HooksCollectedData<T>> {
        this.logger.log(
            `Collecting and clearing data for key prefix ${keyPrefix}`,
        );
        const redis = this.redisService.getClient();
        const key = this.getKey('data', keyPrefix);
        const jobKey = this.getKey('job', keyPrefix);
        const raw = await redis.get(key);
        if (!raw) {
            this.logger.log('No data found');
            return {};
        }
        await redis.del(key);
        await redis.del(jobKey);
        const data: HooksCollectedData<T> = JSON.parse(
            raw,
        ) as HooksCollectedData<T>;
        this.logger.log(`Collected data: ${JSON.stringify(data)}`);
        return data;
    }

    private async waitUntilSilent(
        lockKey: string,
        interval = 500,
    ): Promise<void> {
        this.logger.log(`Waiting for silence on lock key ${lockKey}`);
        const redis = this.redisService.getClient();
        // const counterKey = `${keyPrefix}_counter`;
        // const counter = await redis.get(counterKey);
        // console.log('counter');
        // console.log(counter);
        // if (!alreadyQueued && Number(counter) >= 50) {
        //     // сразу запускаем задачу
        //     await redis.del(lockKey); // снимаем "тишину", чтобы job пошёл
        // }

        while (true) {
            const isSilent = !(await redis.exists(lockKey));
            if (isSilent) {
                this.logger.log('Silence achieved');
                break;
            }
            // this.logger.log(`Still waiting for silence, checking again in ${interval}ms`);
            // await new Promise((resolve) => setTimeout(resolve, interval));
            await delay(interval);
        }
    }

    private getKey(type: 'data' | 'lock' | 'job', keyPrefix: string) {
        return `${keyPrefix}_${type}`;
    }
}
