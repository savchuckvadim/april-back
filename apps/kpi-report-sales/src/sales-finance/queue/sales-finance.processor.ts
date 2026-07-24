import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QueueNames } from 'src/modules/queue/constants/queue-names.enum';
import { JobNames } from 'src/modules/queue/constants/job-names.enum';
import { WsService } from '@/core/ws';
import { PBXService } from '@/modules/pbx';
import { SalesFinanceCacheService } from '../cache/sales-finance-cache.service';
import { SALES_FINANCE_WS_EVENTS } from '../constants/sales-finance.const';
import {
    ClosedSalesJobData,
    HotClientsJobData,
} from '../dto/sales-finance-job.dto';
import { ClosedSalesUseCase } from '../domain/use-cases/closed-sales.use-case';
import { HotClientsUseCase } from '../domain/use-cases/hot-clients.use-case';

/**
 * Воркер финансовой аналитики отдела продаж. Третий процессор на очереди
 * SALES_KPI_REPORT (прецедент: SalesUserReportQueueProcessor). Весь compute
 * здесь: bitrix-инстанс создаётся per-job через pbx.init(domain), результат
 * пишется в Redis use-case'ом и отправляется клиенту по WS.
 */
@Processor(QueueNames.SALES_KPI_REPORT)
export class SalesFinanceQueueProcessor {
    private readonly logger = new Logger(SalesFinanceQueueProcessor.name);

    constructor(
        private readonly ws: WsService,
        private readonly pbx: PBXService,
        private readonly cache: SalesFinanceCacheService,
    ) {}

    @Process(JobNames.SALES_FINANCE_CLOSED_SALES)
    async handleClosedSales(job: Job<ClosedSalesJobData>): Promise<void> {
        const { socketId, domain } = job.data;
        this.logger.log(`SALES_FINANCE_CLOSED_SALES: ${domain}`);
        try {
            const report = await new ClosedSalesUseCase(
                this.pbx,
                this.cache,
            ).execute(job.data);
            this.notify(
                socketId,
                SALES_FINANCE_WS_EVENTS.CLOSED_SALES_DONE,
                report,
            );
        } catch (error) {
            this.notifyError(
                socketId,
                SALES_FINANCE_WS_EVENTS.CLOSED_SALES_ERROR,
                error,
            );
            throw error;
        }
    }

    @Process(JobNames.SALES_FINANCE_HOT_CLIENTS)
    async handleHotClients(job: Job<HotClientsJobData>): Promise<void> {
        const { socketId, domain } = job.data;
        this.logger.log(`SALES_FINANCE_HOT_CLIENTS: ${domain}`);
        try {
            const report = await new HotClientsUseCase(
                this.pbx,
                this.cache,
            ).execute(job.data);
            this.notify(
                socketId,
                SALES_FINANCE_WS_EVENTS.HOT_CLIENTS_DONE,
                report,
            );
        } catch (error) {
            this.notifyError(
                socketId,
                SALES_FINANCE_WS_EVENTS.HOT_CLIENTS_ERROR,
                error,
            );
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

    private notifyError(
        socketId: string | undefined,
        event: string,
        error: unknown,
    ): void {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`${event}: ${message}`);
        this.notify(socketId, event, { message });
    }
}
