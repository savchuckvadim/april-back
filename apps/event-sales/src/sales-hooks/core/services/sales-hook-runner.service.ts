import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx/pbx.service';
import { WsService } from '@/core/ws/ws.service';
import { getErrorDetails } from '@/shared';
import { SalesBatchGroupBuffer } from '../../../shared/batch';
import { SalesHookStatusService } from './sales-hook-status.service';
import { SalesHookRegistryService } from './sales-hook-registry.service';
import { SalesHookJobData } from '../contracts/sales-hook-job.type';
import { SalesHookExecutionContext } from '../contracts/sales-hook-use-case.contract';
import { SALES_HOOK_WS_EVENTS } from '../constants/sales-hook.const';

/**
 * Исполнитель операции sales-хука — общий для всех хуков и обоих путей
 * (робот/кнопка). Обобщение EventFlowProcessor из event-report:
 * статус → pbx.init → use-case → done/failed + WS + rethrow (для Bull-retry).
 */
@Injectable()
export class SalesHookRunnerService {
    private readonly logger = new Logger(SalesHookRunnerService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly status: SalesHookStatusService,
        private readonly registry: SalesHookRegistryService,
        private readonly ws: WsService,
    ) {}

    async run(job: SalesHookJobData): Promise<void> {
        const { domain, hook, operationId } = job;

        // Нет статуса — операцию не выполняем: защититься от «слепого» job'а
        // (статус протух или job подделан) важнее, чем доделать работу.
        const operation = await this.status.get(domain, operationId);
        if (!operation) {
            this.logger.warn(
                `sales-hook ${hook}/${operationId}: статус операции не найден — job пропущен`,
            );
            return;
        }

        const running = await this.status.setRunning(
            operation,
            new Date().toISOString(),
        );

        try {
            const { bitrix, PortalModel: portal } = await this.pbx.init(domain);
            const buffer = new SalesBatchGroupBuffer(bitrix);
            const ctx: SalesHookExecutionContext = {
                domain,
                hook,
                source: job.source,
                operationId,
                initiatorUserId: job.initiatorUserId,
                bitrix,
                portal,
                buffer,
            };

            const result = await this.registry
                .get(hook)
                .execute(ctx, job.items);

            // Финальный flush: добираем команды, которые use-case накопил
            // в буфере, но не отправил (контракт bitrix-batch-grouping §5).
            await buffer.flush();

            const done = await this.status.setDone(
                running,
                result,
                new Date().toISOString(),
            );
            this.notify(job.socketId, SALES_HOOK_WS_EVENTS.DONE, done);
        } catch (error) {
            const { message } = getErrorDetails(error);
            const failed = await this.status.setFailed(
                running,
                message,
                new Date().toISOString(),
            );
            this.notify(job.socketId, SALES_HOOK_WS_EVENTS.ERROR, failed);
            // rethrow: Bull пометит job failed и применит retry-политику
            throw error;
        }
    }

    private notify(
        socketId: string | undefined,
        event: string,
        data: unknown,
    ): void {
        if (!socketId) return;
        this.ws.sendToClient(socketId, { event, data });
    }
}
