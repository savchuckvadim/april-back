// core/silence/silent-job-manager.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { QueueDispatcherService } from 'src/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from 'src/modules/queue/constants/queue-names.enum';
// import { SilentJobHandlerId } from './constants/silent-job-handlers.enum';
import { HandlerMap } from './silent-job-handlers.registry';
import { SilentJobHandlerId } from './constants/silent-job-handlers.enum';

@Injectable()
export class SilentJobManagerService {
    private readonly logger = new Logger(SilentJobManagerService.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly queueDispatcher: QueueDispatcherService
    ) {
        this.logger.log('SilentJobManagerService initialized');
    }

    async handle<T extends keyof HandlerMap>(
        keyPrefix: string,
        ttlMs: number,
        data: HandlerMap[T]['collected'][string], // один элемент
        jobName: SilentJobHandlerId,
        jobPayload: HandlerMap[T]['payload'],
    ) {
        this.logger.log(`Handling job ${jobName} with key prefix ${keyPrefix}`);
        const redis = this.redisService.getClient();
        console.log('SilentJobManagerService handle redis');

        const key = `${keyPrefix}_data`;
        const lockKey = `${keyPrefix}_lock`;
        const jobKey = `${keyPrefix}_job`;

        const id = Date.now();
        const existingRaw = await redis.get(key);
        const current = existingRaw ? JSON.parse(existingRaw) : {};
        current[id] = data;

        // this.logger.log(`Current data: ${JSON.stringify(current)}`);

        await redis.set(key, JSON.stringify(current));
        await redis.set(lockKey, '1', 'PX', ttlMs);

        // счетчик для ограничения количества запусков. цель - сбросить тишину при 50 запросах
        const counterKey = `${keyPrefix}_counter`;
        await redis.incr(counterKey);
        await redis.expire(counterKey, Math.ceil(ttlMs / 1000)); // expire, чтоб не жило вечно

        // console.log('current');

        // console.log(current);

        const alreadyQueued = await redis.get(jobKey);
        this.logger.log(`Job already queued: ${!!alreadyQueued}`);
        // console.log('alreadyQueued');
        // console.log(alreadyQueued);
        // console.log('jobName');
        // console.log('jobPayload');
        // console.log(jobName);
        // console.log(jobPayload);

    
        const dispatchData = {
            key: keyPrefix,
            handlerId: jobName,
            payload: jobPayload,
        };
        // this.logger.log(`Dispatch data: ${JSON.stringify(dispatchData)}`);
        // console.log('dispatchData');
        // console.log(dispatchData);
        if (!alreadyQueued) {
            this.logger.log('Queueing new job');
            await redis.set(jobKey, '1', 'EX', 10);
            await this.queueDispatcher.dispatch(QueueNames.SILENT, jobName, dispatchData);

        }
    }

    async collectAndClear<T>(keyPrefix: string): Promise<Record<string, T>> {
        this.logger.log(`Collecting and clearing data for key prefix ${keyPrefix}`);
        const redis = this.redisService.getClient();
        const key = `${keyPrefix}_data`;
        const raw = await redis.get(key);
        if (!raw) {
            this.logger.log('No data found');
            return {};
        }
        await redis.del(key);
        const data = JSON.parse(raw);
        this.logger.log(`Collected data: ${JSON.stringify(data)}`);
        return data;
    }

    async waitUntilSilent(lockKey: string, interval = 500): Promise<void> {
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
            await new Promise((resolve) => setTimeout(resolve, interval));
        }
    }
}
