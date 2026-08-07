import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { SalesHookStatusService } from './sales-hook-status.service';
import { SalesHookIdempotencyService } from './sales-hook-idempotency.service';
import {
    EnumSalesHookCode,
    SALES_HOOK_JOB_NAMES,
} from '../constants/sales-hook-code.enum';
import {
    EnumSalesHookSource,
    SalesHookJobData,
} from '../contracts/sales-hook-job.type';
import { SalesHookOperationDto } from '../dto/sales-hook-operation.dto';

/** Элемент приёмки: полезная нагрузка + ключ сущности для дедупа/замка. */
export interface SalesHookIntakeItem<TItem = unknown> {
    /** Например `lead:42` или `company:7` — стабильный ключ сущности. */
    entityKey: string;
    /** Отпечаток бизнес-параметров (idempotency.fingerprint). */
    fingerprint: string;
    data: TItem;
}

export interface SalesHookIntakeOptions {
    operationId?: string;
    socketId?: string;
    initiatorUserId?: number;
}

/**
 * ЕДИНСТВЕННОЕ место создания операций sales-хуков. Используется и
 * контроллерами кнопок (source=frame), и подписчиком silence (source=robot):
 * дедуп элементов → статус queued → dispatch в EVENT_SALES_HOOK_OPS
 * с jobId = operationId.
 */
@Injectable()
export class SalesHookDispatchService {
    private readonly logger = new Logger(SalesHookDispatchService.name);

    constructor(
        private readonly queue: QueueDispatcherService,
        private readonly status: SalesHookStatusService,
        private readonly idempotency: SalesHookIdempotencyService,
    ) {}

    /**
     * Принимает пачку элементов. Возвращает существующую операцию при повторе
     * operationId/двойном клике, иначе создаёт новую. null — все элементы
     * оказались дублями (повтор робота), операция не создаётся.
     */
    async accept<TItem>(
        hook: EnumSalesHookCode,
        domain: string,
        source: EnumSalesHookSource,
        items: SalesHookIntakeItem<TItem>[],
        options: SalesHookIntakeOptions = {},
    ): Promise<SalesHookOperationDto | null> {
        // 1. Повторный запрос с тем же operationId → отдаём как есть.
        if (options.operationId) {
            const existing = await this.status.get(domain, options.operationId);
            if (existing) return existing;
        }

        // 2. Двойной клик без operationId: alias по (hook, сущность, юзер).
        if (!options.operationId && items.length === 1) {
            const aliasId = await this.idempotency.getAliasOperationId(
                domain,
                hook,
                items[0].entityKey,
                options.initiatorUserId,
            );
            if (aliasId) {
                const existing = await this.status.get(domain, aliasId);
                if (existing) return existing;
            }
        }

        // 3. Дедуп по отпечатку внутри пачки и против недавних приёмов.
        const fresh: SalesHookIntakeItem<TItem>[] = [];
        const seenInBatch = new Set<string>();
        let lastSeenOperationId: string | null = null;
        for (const item of items) {
            if (seenInBatch.has(item.fingerprint)) continue;
            seenInBatch.add(item.fingerprint);
            const seenOperationId = await this.idempotency.getSeenOperationId(
                domain,
                item.fingerprint,
            );
            if (seenOperationId) {
                lastSeenOperationId = seenOperationId;
                this.logger.log(
                    `sales-hook ${hook}: элемент ${item.entityKey} отброшен как недавний повтор`,
                );
                continue;
            }
            fresh.push(item);
        }
        if (fresh.length === 0) {
            // Вся пачка — повтор: отдаём операцию, которая её уже приняла
            // (важно для кнопки фрейма — клик после недавнего робота должен
            // вернуть живую операцию, а не пустоту).
            return lastSeenOperationId
                ? this.status.get(domain, lastSeenOperationId)
                : null;
        }

        // 4. Создаём операцию и ставим job.
        const operationId = options.operationId ?? randomUUID();
        const job: SalesHookJobData<TItem> = {
            hook,
            domain,
            operationId,
            source,
            socketId: options.socketId,
            initiatorUserId: options.initiatorUserId,
            items: fresh.map(item => item.data),
        };
        const operation = await this.status.setQueued(
            job,
            new Date().toISOString(),
        );

        for (const item of fresh) {
            await this.idempotency.markSeen(
                domain,
                item.fingerprint,
                operationId,
            );
        }
        if (fresh.length === 1) {
            await this.idempotency.setAliasOperationId(
                domain,
                hook,
                fresh[0].entityKey,
                operationId,
                options.initiatorUserId,
            );
        }

        // removeOnFail: false — упавшие операции остаются видимыми в Bull.
        await this.queue.dispatch(
            QueueNames.EVENT_SALES_HOOK_OPS,
            SALES_HOOK_JOB_NAMES[hook],
            job,
            operationId,
            { removeOnComplete: true, removeOnFail: false },
        );

        return operation;
    }
}
