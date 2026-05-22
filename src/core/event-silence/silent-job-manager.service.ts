import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QueueDispatcherService } from 'src/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from 'src/modules/queue/constants/queue-names.enum';
import { RedisService } from '@/core/redis/redis.service';
import {
    EventSilentJobManagerData,
    EventSilentJobManagerHandler,
    HooksCollectedData,
    SILENCE_EVENT_PREFIX,
} from './event-silence.type';
import { delay } from '@/shared';



@Injectable()
export class EventSilentJobManagerService {
    private readonly ttlMs = 1500;
    private readonly logger = new Logger(EventSilentJobManagerService.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly queueDispatcher: QueueDispatcherService,
        private readonly eventEmitter: EventEmitter2,
    ) {
        this.logger.log('Event SilentJobManagerService initialized');
    }

    async handle<T>(ddosItem: EventSilentJobManagerData<T>) {
        const { keyPrefix, data, jobName } = ddosItem;

        const redis = this.redisService.getClient();

        const key = this.getKey('data', keyPrefix);
        const lockKey = this.getKey('lock', keyPrefix);
        const jobKey = this.getKey('job', keyPrefix);

        const seqKey = this.getKey('seq', keyPrefix);
        const id = await redis.incr(seqKey);
        await redis.pexpire(seqKey, this.ttlMs * 3);

        // HSET атомарно пишет только свой field — не трогает данные других запросов
        await redis.hset(key, String(id), JSON.stringify(data));
        await redis.pexpire(key, this.ttlMs * 3);
        await redis.set(lockKey, '1', 'PX', this.ttlMs);

        const wasSet = await redis.set(jobKey, '1', 'EX', 10, 'NX');
        if (wasSet === 'OK') {
            this.logger.log('Queueing new job');
            await this.queueDispatcher.dispatch(
                QueueNames.EVENT_SILENT,
                jobName,
                ddosItem,
            );
        }
    }

    // выполняется из очереди
    public async process<T>(ddosItem: EventSilentJobManagerData<T>): Promise<void> {
        const { keyPrefix, domain, jobName } = ddosItem;
        const lockKey = `${keyPrefix}_lock`;

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
        this.logger.log(`Emitting event: ${eventName}`);
        await this.eventEmitter.emitAsync(eventName, handleData);
    }

    private async collectAndClear<T>(keyPrefix: string): Promise<HooksCollectedData<T>> {
        this.logger.log(`Collecting and clearing data for key prefix ${keyPrefix}`);
        const redis = this.redisService.getClient();
        const key = this.getKey('data', keyPrefix);
        const jobKey = this.getKey('job', keyPrefix);
        const raw = await redis.hgetall(key);
        if (!raw || Object.keys(raw).length === 0) {
            this.logger.log('No data found');
            return {};
        }
        await redis.del(key);
        await redis.del(jobKey);
        const data: HooksCollectedData<T> = {};
        for (const [field, value] of Object.entries(raw)) {
            data[field] = JSON.parse(value) as T;
        }
        this.logger.log(`Collected ${Object.keys(data).length} items`);
        return data;
    }

    private async waitUntilSilent(lockKey: string, interval = 500): Promise<void> {
        // this.logger.log(`Waiting for silence on lock key ${lockKey}`);
        const redis = this.redisService.getClient();
        while (true) {
            const isSilent = !(await redis.exists(lockKey));
            if (isSilent) {
                this.logger.log('Silence achieved');
                break;
            }
            await delay(interval);
        }
    }

    private getKey(type: 'data' | 'lock' | 'job' | 'seq', keyPrefix: string) {
        return `${keyPrefix}_${type}`;
    }
}
