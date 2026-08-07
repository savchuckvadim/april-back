import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import {
    SALES_HOOK_CACHE_APP,
    SALES_HOOK_STATUS_TTL_SECONDS,
} from '../constants/sales-hook.const';
import {
    EnumSalesHookOperationStatus,
    SalesHookOperationDto,
} from '../dto/sales-hook-operation.dto';
import { SalesHookJobData } from '../contracts/sales-hook-job.type';

/**
 * Статус операции sales-хука в AppCache (Redis + MySQL app_cache).
 *
 * Живёт вне Bull: очередь освобождает job после завершения, а нам нужно
 * отвечать «операция уже выполнена» и через минуту, и после перезагрузки
 * фрейма. Ключ op:{operationId} — одновременно защита от повторного
 * выполнения (обобщение EventFlowStatusService из event-report).
 */
@Injectable()
export class SalesHookStatusService {
    private readonly logger = new Logger(SalesHookStatusService.name);

    constructor(private readonly appCache: AppCacheService) {}

    async get(
        domain: string,
        operationId: string,
    ): Promise<SalesHookOperationDto | null> {
        return this.appCache.get<SalesHookOperationDto>({
            app: SALES_HOOK_CACHE_APP,
            domain,
            key: this.key(operationId),
        });
    }

    async setQueued(
        job: SalesHookJobData,
        queuedAt: string,
    ): Promise<SalesHookOperationDto> {
        return this.write(job.domain, {
            operationId: job.operationId,
            hook: job.hook,
            domain: job.domain,
            source: job.source,
            status: EnumSalesHookOperationStatus.QUEUED,
            itemsCount: job.items.length,
            queuedAt,
            startedAt: null,
            finishedAt: null,
            result: null,
            error: null,
        });
    }

    async setRunning(
        operation: SalesHookOperationDto,
        startedAt: string,
    ): Promise<SalesHookOperationDto> {
        return this.write(operation.domain, {
            ...operation,
            status: EnumSalesHookOperationStatus.RUNNING,
            startedAt,
        });
    }

    async setDone(
        operation: SalesHookOperationDto,
        result: unknown,
        finishedAt: string,
    ): Promise<SalesHookOperationDto> {
        return this.write(operation.domain, {
            ...operation,
            status: EnumSalesHookOperationStatus.DONE,
            finishedAt,
            result,
            error: null,
        });
    }

    async setFailed(
        operation: SalesHookOperationDto,
        error: string,
        finishedAt: string,
    ): Promise<SalesHookOperationDto> {
        return this.write(operation.domain, {
            ...operation,
            status: EnumSalesHookOperationStatus.FAILED,
            finishedAt,
            error,
        });
    }

    private async write(
        domain: string,
        operation: SalesHookOperationDto,
    ): Promise<SalesHookOperationDto> {
        await this.appCache.set({
            app: SALES_HOOK_CACHE_APP,
            domain,
            key: this.key(operation.operationId),
            group: 'operation',
            data: operation,
            ttlSeconds: SALES_HOOK_STATUS_TTL_SECONDS,
        });
        this.logger.debug(
            `sales-hook op ${operation.hook}/${operation.operationId} → ${operation.status}`,
        );
        return operation;
    }

    private key(operationId: string): string {
        return `op:${operationId}`;
    }
}
