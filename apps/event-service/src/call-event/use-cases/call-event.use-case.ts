import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { CallingEventDto } from '../dto/calling-event.dto';
import { CallEventInitService } from '../services/init/call-event-init.service';
import { CallEventContext } from '../services/context/call-event.context';
import { CallingFlowService } from '../services/calling/calling-flow.service';
import { CompanyDealUpdateService } from '../services/entity/company-deal-update.service';
import { SmartReportFlowService } from '../services/smart/smart-report-flow.service';

export interface ICallEventResult {
    success: boolean;
    factCount: number;
    eduCount: number;
    presCount: number;
}

/**
 * Оркестратор обработки события звонка (порт legacy-эндпоинта `/calling`).
 *
 * Шаги:
 *  1. `PBXService.init(domain)` — инстанс bitrix + portal.
 *  2. `CallEventInitService.loadContext` — чтения (компания, контакты, задачи,
 *     ОРК-история, смарты, сделка, товары).
 *  3. Поток A (`CallingFlowService`) — задачи + записи ОРК-история.
 *  4. Поток A (`CompanyDealUpdateService`) — обновление компании/сделки.
 *  5. Поток B (`SmartReportFlowService`) — смарт-отчёт `service_month`.
 *  6. Один финальный `callBatch` — все накопленные команды одним HTTP.
 *
 * @Injectable, но без `this.bitrix` — инстанс создаётся в init и передаётся
 * во flow-сервисы параметром (CLAUDE.md, race condition между порталами).
 */
@Injectable()
export class CallEventUseCase {
    private readonly logger = new Logger(CallEventUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly initService: CallEventInitService,
    ) {}

    async execute(dto: CallingEventDto): Promise<ICallEventResult> {
        const { bitrix, PortalModel: portal } = await this.pbx.init(dto.domain);

        const init = await this.initService.loadContext(dto, bitrix, portal);
        const ctx = new CallEventContext(dto, portal, init);

        // Поток A — обработка звонка (задачи + ОРК-история)
        new CallingFlowService(bitrix, portal, ctx).queue(ctx);

        // Поток A — обновление компании/сделки
        const [factCount, eduCount, presCount] = new CompanyDealUpdateService(
            bitrix,
            portal,
        ).queue(ctx);

        // Поток B — смарт-отчёт service_month
        new SmartReportFlowService(bitrix, portal).queue(ctx);

        await bitrix.api.callBatchWithConcurrency(1);

        this.logger.log(
            `call-event обработан: domain=${dto.domain}, company=${ctx.companyId}, ` +
                `fact=${factCount}, edu=${eduCount}, pres=${presCount}`,
        );
        return { success: true, factCount, eduCount, presCount };
    }
}
