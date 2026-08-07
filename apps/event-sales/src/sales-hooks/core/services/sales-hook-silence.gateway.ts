import { Injectable } from '@nestjs/common';
import {
    EventSilentJobManagerData,
    EventSilentJobManagerService,
} from '@lib/core/event-silence';
import {
    EnumSalesHookCode,
    SALES_HOOK_JOB_NAMES,
} from '../constants/sales-hook-code.enum';
import { SalesHookRobotEnvelope } from '../contracts/sales-hook-job.type';

/**
 * Приём вебхука робота в silence-буфер (libs/core/event-silence).
 *
 * Ключ канала = хук + портал + scope (обычно id сущности или ответственный):
 * burst событий одного канала схлопывается в одну пачку после окна тишины
 * 1.5 с. Ответ вебхуку — только факт приёма. В буфер кладётся конверт с
 * entityKey — он нужен подписчику для дедупа и замков.
 */
@Injectable()
export class SalesHookSilenceGateway {
    constructor(private readonly silentManager: EventSilentJobManagerService) {}

    async accept<TItem>(
        hook: EnumSalesHookCode,
        domain: string,
        scope: string,
        envelope: SalesHookRobotEnvelope<TItem>,
    ): Promise<string> {
        const keyPrefix = this.keyPrefix(hook, domain, scope);
        const item: EventSilentJobManagerData<SalesHookRobotEnvelope<TItem>> = {
            keyPrefix,
            data: envelope,
            jobName: SALES_HOOK_JOB_NAMES[hook],
            domain,
        };
        await this.silentManager.handle(item);
        return keyPrefix;
    }

    /** `SALES_HOOK_{code}_{domain_с_подчёркиваниями}_{scope}`. */
    keyPrefix(hook: EnumSalesHookCode, domain: string, scope: string): string {
        const domainKey = domain.replace(/\./g, '_');
        return `SALES_HOOK_${hook}_${domainKey}_${scope}`;
    }
}
