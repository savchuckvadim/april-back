import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
    IColdCallData,
    IColdHookSilenceHandlerData,
} from '../../type/cold-hook-silence.interface';
import {
    EventSilentJobManagerData,
    EventSilentJobManagerHandler,
    EventSilentJobManagerService,
    SILENCE_EVENT_PREFIX,
} from '@lib/core/event-silence';
import { JobNames } from '@lib/queue';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { ColdCallHookResponseDto } from '../../dto/cold-call-response.dto';

@Injectable()
export class ColdHookSilinceEndpointService {
    private readonly logger = new Logger(ColdHookSilinceEndpointService.name);

    constructor(
        private readonly silentManager: EventSilentJobManagerService,
        private readonly queueDispatcher: QueueDispatcherService,
    ) {}

    async createColdCallHook(
        domain: string,
        coldCallData: IColdCallData,
    ): Promise<ColdCallHookResponseDto> {
        const domainKey = domain.replace(/\./g, '_');
        const keyPrefix = `XO_event_sales_cold_call_${domainKey}_${coldCallData.responsible}`;
        this.logger.log(
            `[DEADLINE][silent] createColdCallHook enter domain=${domain} keyPrefix=${keyPrefix} ` +
                `entityType=${coldCallData.entityType} entityId=${coldCallData.entityId} ` +
                `responsible=${coldCallData.responsible} rawDeadline="${coldCallData.deadline}"`,
        );

        const ddosItem: EventSilentJobManagerData<IColdCallData> = {
            keyPrefix,
            data: coldCallData,
            jobName: JobNames.EVENT_COLD_CALL,
            domain,
        };

        await this.silentManager.handle<IColdCallData>(ddosItem);
        this.logger.log(
            `[DEADLINE][silent] createColdCallHook exit keyPrefix=${keyPrefix} ` +
                `rawDeadline="${coldCallData.deadline}" (буфер; реальная обработка асинхронна)`,
        );

        return {
            accepted: true,
            domain,
            keyPrefix,
            rawDeadline: coldCallData.deadline,
            message: 'Холодный звонок принят и поставлен в очередь обработки.',
        };
    }

    /**
     * Окно тишины закрылось — в очередь `EVENT_SALES_COLD_CALL`, где окна
     * идут строго по одному (`ColdHooksProcessor`). Без `{ async: true }`:
     * с ним слушателя не ждали, и окна обрабатывались параллельно.
     */
    @OnEvent(`${SILENCE_EVENT_PREFIX}:${JobNames.EVENT_COLD_CALL}`)
    async onColdCallSilence(
        data: EventSilentJobManagerHandler<IColdCallData>,
    ): Promise<void> {
        const job: IColdHookSilenceHandlerData = {
            collected: data.collected,
            payload: data.payload,
        };
        this.logger.log(
            `[silence event] cold-call → очередь, domain=${data.payload.domain} collected=${Object.keys(data.collected).length}`,
        );
        await this.queueDispatcher.dispatch(
            QueueNames.EVENT_SALES_COLD_CALL,
            JobNames.EVENT_COLD_CALL,
            job,
        );
    }
}
