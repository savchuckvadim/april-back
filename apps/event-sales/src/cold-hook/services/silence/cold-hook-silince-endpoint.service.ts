import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IColdCallData } from '../../type/cold-hook-silence.interface';
import { ColdHooksHandlerService } from './cold-hooks-handler.service';
import {
    EventSilentJobManagerData,
    EventSilentJobManagerHandler,
    EventSilentJobManagerService,
    SILENCE_EVENT_PREFIX,
} from '@lib/core/event-silence';
import { JobNames } from '@lib/queue';
import { ColdCallHookResponseDto } from '../../dto/cold-call-response.dto';

@Injectable()
export class ColdHookSilinceEndpointService {
    private readonly logger = new Logger(ColdHookSilinceEndpointService.name);

    constructor(
        private readonly hooksHandler: ColdHooksHandlerService,
        private readonly silentManager: EventSilentJobManagerService,
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

    @OnEvent(`${SILENCE_EVENT_PREFIX}:${JobNames.EVENT_COLD_CALL}`, {
        async: true,
    })
    async onColdCallSilence(data: EventSilentJobManagerHandler<IColdCallData>) {
        this.logger.log(
            `[silence event] cold-call received, domain=${data.payload.domain} collected=${Object.keys(data.collected).length}`,
        );
        await this.hooksHandler.handleHooks(
            data.payload.domain,
            data.collected,
        );
    }
}
