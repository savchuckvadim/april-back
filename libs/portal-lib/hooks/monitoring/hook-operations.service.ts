import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import {
    HookOperationsSummary,
    HookOperationView,
    parseHookOperation,
    summarizeOperations,
} from './lib/summarize-operations';

/** Пространство app-cache операций sales-хуков (SALES_HOOK_CACHE_APP в event-sales). */
export const HOOK_OPERATIONS_CACHE_APP = 'event-sales-hooks';
const OPERATION_GROUP = 'operation';
/** Сколько строк читать из кэша до фильтра по хуку — статусы живут час, больше не бывает. */
const SCAN_LIMIT = 500;

export interface HookOperationsPage {
    operations: HookOperationView[];
    summary: HookOperationsSummary;
}

/**
 * Мониторинг операций sales-хуков по порталу — читает те же записи
 * app-cache (MySQL `app_cache`), которые event-sales пишет для поллинга
 * фрейма. Записи живут час (TTL) и чистятся кроном раз в час, поэтому
 * это окно «последний час-два», а не архив. В Redis не ходим: БД —
 * источник истины кэша, а админке важна полнота, не скорость.
 */
@Injectable()
export class HookOperationsService {
    constructor(private readonly prisma: PrismaService) {}

    async listByPortal(
        portalId: number,
        hook: string | null,
        limit: number,
    ): Promise<HookOperationsPage> {
        const rows = await this.prisma.appCache.findMany({
            where: {
                portalId: BigInt(portalId),
                app: HOOK_OPERATIONS_CACHE_APP,
                group: OPERATION_GROUP,
            },
            orderBy: { updatedAt: 'desc' },
            take: SCAN_LIMIT,
            select: { data: true, updatedAt: true },
        });
        const all = rows
            .map(row => parseHookOperation(row.data, row.updatedAt))
            .filter((op): op is HookOperationView => op !== null)
            .filter(op => hook === null || op.hook === hook);
        return {
            operations: all.slice(0, limit),
            summary: summarizeOperations(all),
        };
    }
}
