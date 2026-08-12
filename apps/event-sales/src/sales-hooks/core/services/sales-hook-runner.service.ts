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
import { EnumSalesHookCode } from '../constants/sales-hook-code.enum';

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
            let { bitrix, PortalModel: portal } = await this.pbx.init(domain);

            /*
             * Слепок портала кэшируется на 10 часов, а pbx-поля ставят на
             * портал в любой момент. Пустая секция полей лида = слепок
             * протух: хук молча потерял бы все записи в лид (симптом —
             * «поля установлены, а в лиде пусто»). Перечитываем один раз;
             * у сброса свой кулдаун, поэтому портал без установленных полей
             * не будет дёргать внешний API на каждой операции.
             */
            if (!portal.hasEntityFields('lead')) {
                this.logger.warn(
                    `sales-hook ${hook}/${operationId}: слепок ${domain} без полей лида — перечитываю портал`,
                );
                ({ bitrix, PortalModel: portal } =
                    await this.pbx.initFresh(domain));
            }

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
            this.logBatchErrors(hook, operationId, buffer.getResults());

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

    /**
     * Ошибки ОТДЕЛЬНЫХ команд батча. Битрикс не роняет весь запрос из-за
     * одной неудачной команды: остальные выполняются, а неудачная тихо
     * оседает в `result_error`. Без этого лога симптом выглядит как «поле
     * просто не заполнилось», а причина (неверный формат значения,
     * недоступная стадия, нет прав) не видна вообще.
     */
    private logBatchErrors(
        hook: EnumSalesHookCode,
        operationId: string,
        chunks: { result_error?: Record<string, unknown> | unknown[] }[],
    ): void {
        for (const chunk of chunks) {
            const errors = chunk?.result_error;
            if (!errors || Array.isArray(errors)) continue;
            for (const [cmd, raw] of Object.entries(errors)) {
                const error = raw as {
                    error?: string;
                    error_description?: string;
                };
                this.logger.error(
                    `sales-hook ${hook}/${operationId}: команда ${cmd} не выполнена — ` +
                        `${error.error ?? '—'} ${error.error_description ?? ''}`.trim(),
                );
            }
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
