import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { WsService } from '@/core/ws';
import { EVENT_FLOW_WS_EVENTS } from '../constants/event-flow.const';
import { EventFlowJobData } from '../dto/event-flow-job.dto';
import { EventFlowStatusService } from '../services/status/event-flow-status.service';
import { EventReportUseCase } from '../use-cases/event-report.use-case';

/**
 * Воркер отправки отчёта менеджера.
 *
 * Здесь и только здесь выполняется batch Битрикса: раньше он крутился прямо в
 * HTTP-запросе, и менеджер ждал его целиком. Теперь контроллер отвечает сразу,
 * а исход доезжает по WS (или поллингом статуса, если сокета нет).
 */
@Injectable()
@Processor(QueueNames.EVENT_SALES_FLOW)
export class EventFlowProcessor {
    private readonly logger = new Logger(EventFlowProcessor.name);

    constructor(
        private readonly ws: WsService,
        private readonly status: EventFlowStatusService,
        private readonly useCase: EventReportUseCase,
    ) {
        // Как у ColdHooksProcessor: без этой строки в логе нельзя отличить
        // «воркер не поднялся» от «джобов не было» — а разница критичная,
        // в первом случае отчёты молча копятся в очереди.
        this.logger.log('EventFlowProcessor initialized');
    }

    @Process(JobNames.EVENT_SALES_FLOW)
    async handle(job: Job<EventFlowJobData>): Promise<void> {
        const { operationId, domain, socketId, dto } = job.data;
        const waitedMs = Date.now() - job.timestamp;
        this.logger.log(
            `EVENT_SALES_FLOW jobId=${job.id} operationId=${operationId} ` +
                `domain=${domain} waitedMs=${waitedMs}`,
        );

        const operation = await this.status.get(domain, operationId);
        if (!operation) {
            // Статус протух или его затёрли — выполнять команду вслепую нельзя:
            // не сможем ни сообщить исход, ни защититься от повтора.
            this.logger.error(
                `operation ${operationId} не найдена в статусах — job отменён`,
            );
            return;
        }

        const running = await this.status.setRunning(
            domain,
            operation,
            new Date().toISOString(),
        );

        try {
            const result = await this.useCase.execute(dto);
            const done = await this.status.setDone(
                domain,
                running,
                result,
                new Date().toISOString(),
            );
            this.notify(socketId, EVENT_FLOW_WS_EVENTS.DONE, done);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            const failed = await this.status.setFailed(
                domain,
                running,
                message,
                new Date().toISOString(),
            );
            this.notify(socketId, EVENT_FLOW_WS_EVENTS.ERROR, failed);
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
