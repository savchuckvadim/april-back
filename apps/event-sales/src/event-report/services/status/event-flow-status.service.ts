import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import {
    EVENT_FLOW_CACHE_APP,
    EVENT_FLOW_STATUS_TTL_SECONDS,
} from '../../constants/event-flow.const';
import {
    EnumEventFlowStatus,
    EventFlowOperationDto,
} from '../../dto/response/event-flow-operation.dto';
import { EventSalesFlowResponseDto } from '../../dto/response/event-sales-flow-response.dto';

/**
 * Статус операции отправки отчёта.
 *
 * Живёт в AppCache (Redis + app_cache в MySQL), а не в самой очереди: Bull
 * освобождает job после завершения, а нам нужно ответить «эта операция уже
 * выполнена» и через минуту, и после перезагрузки фрейма. Плюс это единственная
 * защита от повторного выполнения команды при ретрае.
 */
@Injectable()
export class EventFlowStatusService {
    private readonly logger = new Logger(EventFlowStatusService.name);

    constructor(private readonly appCache: AppCacheService) {}

    async get(
        domain: string,
        operationId: string,
    ): Promise<EventFlowOperationDto | null> {
        return this.appCache.get<EventFlowOperationDto>({
            app: EVENT_FLOW_CACHE_APP,
            domain,
            key: this.key(operationId),
        });
    }

    async setQueued(
        domain: string,
        operationId: string,
        queuedAt: string,
    ): Promise<EventFlowOperationDto> {
        return this.write(domain, {
            operationId,
            status: EnumEventFlowStatus.QUEUED,
            queuedAt,
            startedAt: null,
            finishedAt: null,
            result: null,
            error: null,
        });
    }

    async setRunning(
        domain: string,
        operation: EventFlowOperationDto,
        startedAt: string,
    ): Promise<EventFlowOperationDto> {
        return this.write(domain, {
            ...operation,
            status: EnumEventFlowStatus.RUNNING,
            startedAt,
        });
    }

    async setDone(
        domain: string,
        operation: EventFlowOperationDto,
        result: EventSalesFlowResponseDto,
        finishedAt: string,
    ): Promise<EventFlowOperationDto> {
        return this.write(domain, {
            ...operation,
            status: EnumEventFlowStatus.DONE,
            finishedAt,
            result,
            error: null,
        });
    }

    async setFailed(
        domain: string,
        operation: EventFlowOperationDto,
        error: string,
        finishedAt: string,
    ): Promise<EventFlowOperationDto> {
        return this.write(domain, {
            ...operation,
            status: EnumEventFlowStatus.FAILED,
            finishedAt,
            error,
        });
    }

    private async write(
        domain: string,
        operation: EventFlowOperationDto,
    ): Promise<EventFlowOperationDto> {
        await this.appCache.set({
            app: EVENT_FLOW_CACHE_APP,
            domain,
            key: this.key(operation.operationId),
            group: 'operation',
            data: operation,
            ttlSeconds: EVENT_FLOW_STATUS_TTL_SECONDS,
        });
        this.logger.debug(
            `flow operation ${operation.operationId} → ${operation.status}`,
        );
        return operation;
    }

    private key(operationId: string): string {
        return `operation:${operationId}`;
    }
}
