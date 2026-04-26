import { Injectable } from '@nestjs/common';
import { RedisService } from '@/core/redis/redis.service';

@Injectable()
export class MissedCallsStateService {
    private readonly keyPrefix = 'missed-calls-todo';

    constructor(private readonly redisService: RedisService) {}

    async getLastCheckAt(domain: string): Promise<string | undefined> {
        const value = await this.redisService
            .getClient()
            .get(`${this.keyPrefix}:last-check:${domain}`);
        return value || undefined;
    }

    async setLastCheckAt(domain: string, timestamp: string): Promise<void> {
        await this.redisService
            .getClient()
            .set(`${this.keyPrefix}:last-check:${domain}`, timestamp);
    }

    async markActivityIfNew(
        domain: string,
        activityId: string,
        ttlSeconds = 60 * 60 * 24 * 30,
    ): Promise<boolean> {
        const key = `${this.keyPrefix}:activity:${domain}:${activityId}`;
        const result = await this.redisService
            .getClient()
            .set(key, '1', 'EX', ttlSeconds, 'NX');
        return result === 'OK';
    }
}
