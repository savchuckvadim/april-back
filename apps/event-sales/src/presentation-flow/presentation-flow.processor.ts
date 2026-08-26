import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { WsService } from '@/core/ws';
import { PresentationFlowService } from './presentation-flow.service';
import { PresentationFlowJobData } from './dto/presentation-flow-job.dto';
import {
    PRESENTATION_FLOW_WS_EVENTS,
    PresentationFlowDonePayload,
} from './constants/presentation-flow.const';

/**
 * Воркер сайд-очереди презентаций. Ошибка джоба логируется и НЕ ретраится
 * вечно (джоб ставится без retry): элемент смарта — дополнение к отчёту, а
 * не его условие; потерянный элемент виден по логу и восстановим руками,
 * а сама презентация в любом случае зафиксирована pres-сделкой.
 *
 * По успеху шлёт `presentation-flow:done` ТОЧЕЧНО в socketId клиента —
 * фронт по нему перечитывает презентации. Комнат и адресации по userId нет
 * намеренно: id юзера уникален только в рамках портала, общий канал утёк бы
 * между порталами.
 *
 * Concurrency остаётся 1: один отчёт может поставить ДВА джоба — сначала
 * закрыть текущую презентацию, потом создать следующую, — и порядок между
 * ними обязателен. Параллельный воркер создал бы новый элемент раньше, чем
 * закрылся старый, и «открытым» для следующего отчёта оказался бы не тот.
 * Джобы лёгкие (1–3 вызова), очередь не копится.
 */
@Injectable()
@Processor(QueueNames.EVENT_SALES_PRESENTATION_FLOW)
export class PresentationFlowProcessor {
    private readonly logger = new Logger(PresentationFlowProcessor.name);

    constructor(
        private readonly service: PresentationFlowService,
        private readonly ws: WsService,
    ) {
        this.logger.log('PresentationFlowProcessor initialized');
    }

    @Process(JobNames.EVENT_SALES_PRESENTATION_FLOW)
    async handle(job: Job<PresentationFlowJobData>): Promise<void> {
        try {
            const result = await this.service.handle(job.data);
            if (job.data.socketId && result.action !== 'skipped') {
                const payload: PresentationFlowDonePayload = {
                    ...result,
                    domain: job.data.domain,
                    operationId: job.data.operationId,
                    kind: job.data.kind,
                };
                this.ws.sendToClient(job.data.socketId, {
                    event: PRESENTATION_FLOW_WS_EVENTS.DONE,
                    data: payload,
                });
            }
        } catch (error) {
            this.logger.error(
                `[presentation-flow] джоб ${job.id} (${job.data.domain}, op=${job.data.operationId ?? '-'}) упал: ${(error as Error).message}`,
            );
        }
    }
}
