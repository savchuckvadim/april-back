import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { IColdCallData } from '../../type/cold-hook-silence.interface';
import { ColdHooksHandlerService } from './cold-hooks-handler.service';
import { EventSilentJobManagerService } from '@/apps/event-sales/event-silence/silent-job-manager.service';
import { EventSilentJobManagerData } from '@/apps/event-sales/event-silence/event-silence.type';
import { JobNames } from '@/modules/queue/constants/job-names.enum';

/**
 * Сервис для обработки запроса
 * передает каждый запрос вместе с хендлером в менеджер ddos-а (silent-job-manager.service)
 */
@Injectable()
export class ColdHookSilinceEndpointService implements OnModuleInit {
    private readonly logger = new Logger(ColdHookSilinceEndpointService.name);
    constructor(
        private readonly hooksHandler: ColdHooksHandlerService,
        private readonly silentManager: EventSilentJobManagerService,
    ) {
        this.logger.log('Cold Hook Silence constructor ✅');
    }

    onModuleInit() {
        this.silentManager.registerHandler<IColdCallData>(
            JobNames.EVENT_COLD_CALL,
            async handleData => {
                await this.hooksHandler.handleHooks(
                    handleData.payload.domain,
                    handleData.collected,
                );
            },
        );
    }

    async createColdCallHook(domain: string, coldCallData: IColdCallData) {
        const domainKey = domain.replace(/\./g, '_');
        const keyPrefix = `XO_event_sales_cold_call_${domainKey}_${coldCallData.responsible}`;
        this.logger.log(
            `[silent] cold-hook createColdCallHook enter domain=${domain} keyPrefix=${keyPrefix} entityId=${coldCallData.entityId}`,
        );

        const endpointHandleData: EventSilentJobManagerData<IColdCallData> = {
            keyPrefix,
            data: coldCallData,
            jobName: JobNames.EVENT_COLD_CALL,
            domain,
        };

        await this.silentManager.handle<IColdCallData>(endpointHandleData);
        this.logger.log(
            `[silent] cold-hook createColdCallHook exit keyPrefix=${keyPrefix}`,
        );
    }
}
