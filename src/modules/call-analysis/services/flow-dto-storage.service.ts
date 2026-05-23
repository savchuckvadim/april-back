import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/core/redis/redis.service';
import { EventSalesFlowDto } from '@/apps/event-sales/dto/event-sale-flow/event-sales-flow.dto';

const TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class FlowDtoStorageService {
    private readonly logger = new Logger(FlowDtoStorageService.name);

    constructor(private readonly redisService: RedisService) {}

    private buildKey(domain: string, taskId: number): string {
        return `call_analysis:dto:${domain}:${taskId}`;
    }

    async save(
        domain: string,
        taskId: number,
        dto: Partial<EventSalesFlowDto>,
    ): Promise<void> {
        const redis = this.redisService.getClient();
        const key = this.buildKey(domain, taskId);
        await redis.set(key, JSON.stringify(dto), 'EX', TTL_SECONDS);
        this.logger.log(`Saved flowDto for ${key}`);
    }

    async get(
        domain: string,
        taskId: number,
    ): Promise<Partial<EventSalesFlowDto> | null> {
        const redis = this.redisService.getClient();
        const key = this.buildKey(domain, taskId);
        const raw = await redis.get(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as Partial<EventSalesFlowDto>;
        } catch (e) {
            this.logger.error(
                `Failed to parse stored flowDto for ${key}: ${(e as Error).message}`,
            );
            return null;
        }
    }

    async delete(domain: string, taskId: number): Promise<void> {
        const redis = this.redisService.getClient();
        await redis.del(this.buildKey(domain, taskId));
    }
}
