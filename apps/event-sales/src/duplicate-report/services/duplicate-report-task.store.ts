import { Injectable } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { toId } from '../../shared/department-heads/department-heads.util';
import {
    buildDuplicateReportRecipientsKey,
    buildDuplicateReportTaskKey,
    DUPLICATE_REPORT_TASK_TTL_SEC,
} from '../constants/duplicate-report.const';
import { DuplicateTaskStorePort } from './duplicate-report-delivery';

/**
 * Последняя задача-отчёт получателя на портале — в Redis, и множество
 * получателей портала.
 *
 * Нужна, чтобы новый отчёт закрыл прошлый, а тем, кому отчёта больше нет,
 * прошлая задача закрылась сама: иначе у руководителя копятся задачи
 * «Дубли сделок» за каждую неделю, и непонятно, какая актуальна. Потеря
 * ключа не страшна: прошлую задачу просто закроет сам получатель.
 */
@Injectable()
export class DuplicateReportTaskStore implements DuplicateTaskStorePort {
    constructor(private readonly redisService: RedisService) {}

    async previous(domain: string, userId: number): Promise<number | null> {
        const raw = await this.redisService
            .getClient()
            .get(buildDuplicateReportTaskKey(domain, userId));
        return toId(raw);
    }

    async remember(
        domain: string,
        userId: number,
        taskId: number,
    ): Promise<void> {
        const client = this.redisService.getClient();
        const recipientsKey = buildDuplicateReportRecipientsKey(domain);
        await client.set(
            buildDuplicateReportTaskKey(domain, userId),
            String(taskId),
            'EX',
            DUPLICATE_REPORT_TASK_TTL_SEC,
        );
        await client.sadd(recipientsKey, String(userId));
        await client.expire(recipientsKey, DUPLICATE_REPORT_TASK_TTL_SEC);
    }

    async recipients(domain: string): Promise<number[]> {
        const raw = await this.redisService
            .getClient()
            .smembers(buildDuplicateReportRecipientsKey(domain));
        return raw.map(toId).filter((id): id is number => id !== null);
    }

    async forget(domain: string, userId: number): Promise<void> {
        const client = this.redisService.getClient();
        await client.del(buildDuplicateReportTaskKey(domain, userId));
        await client.srem(
            buildDuplicateReportRecipientsKey(domain),
            String(userId),
        );
    }
}
