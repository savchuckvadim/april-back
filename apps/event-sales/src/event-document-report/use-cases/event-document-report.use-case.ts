import { Injectable, Logger } from '@nestjs/common';
import { SalesDocumentEventJobData } from '@lib/queue';
import { PBXService } from '@/modules/pbx/pbx.service';
import { SalesBatchGroupBuffer } from '../../shared/batch';
import { EventDocumentWriteError } from '../lib/event-document-write.error';
import { EventDocumentContext } from '../services/context/event-document.context';
import { EventDocumentDealFlowService } from '../services/deal/event-document-deal-flow.service';
import { EventDocumentEntityFlowService } from '../services/entity/event-document-entity-flow.service';
import { EventDocumentInitService } from '../services/init/event-document-init.service';
import { EventDocumentKpiFlowService } from '../services/kpi-list/event-document-kpi-flow.service';
import { EventDocumentPresentationListService } from '../services/kpi-list/event-document-presentation-list.service';

/** Итог обработки события — для журнала обработчика. */
export interface EventDocumentReportResult {
    /** Сколько команд ушло в Битрикс одной пачкой. */
    readonly commands: number;
}

/**
 * Поток документов конструктора: событие «документ сформирован» → стадия
 * основной сделки, поля карточек, строки «ОП KPI» и «ОП История».
 *
 * Порядок тот же, что у отчёта о звонке (`EventReportUseCase`): портал →
 * одно чтение пачкой → контекст → сервисы копят команды → одна отправка.
 * Замена легаси `EventDocumentService::getDocumentFlow` (Laravel).
 */
@Injectable()
export class EventDocumentReportUseCase {
    private readonly logger = new Logger(EventDocumentReportUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly initService: EventDocumentInitService,
    ) {}

    /**
     * @throws EventDocumentWriteError сбой на записи: часть команд могла
     *   выполниться, повторять событие автоматически нельзя.
     */
    async execute(
        event: SalesDocumentEventJobData,
    ): Promise<EventDocumentReportResult> {
        if (!event.kinds.length) {
            this.logger.warn(
                `[document-flow] ${event.domain}: событие ${event.eventId} без ` +
                    'документов — пропущено',
            );
            return { commands: 0 };
        }
        // Инстанс Битрикса живёт только в этом вызове (CLAUDE.md): читающая
        // и пишущая пачки копятся и отправляются в одном и том же инстансе.
        const { bitrix, PortalModel: portal } = await this.pbx.init(
            event.domain,
        );
        const snapshot = await this.initService.loadSnapshot(
            event,
            bitrix,
            portal,
        );
        const ctx = new EventDocumentContext(event, portal, snapshot);
        const buffer = new SalesBatchGroupBuffer(bitrix, { strict: true });

        new EventDocumentEntityFlowService(bitrix).queue(ctx, buffer);
        new EventDocumentDealFlowService(bitrix, portal).queue(ctx, buffer);
        await new EventDocumentKpiFlowService(bitrix, portal).queue(
            ctx,
            buffer,
        );
        await new EventDocumentPresentationListService(bitrix, portal).queue(
            ctx,
            buffer,
        );

        const commands = buffer.getCurrentGroupSize();
        // Группа собирается ещё без обращения к Битриксу; запись — только flush.
        await buffer.endGroup();
        try {
            await buffer.flush();
        } catch (error) {
            throw new EventDocumentWriteError(error);
        }
        return { commands };
    }
}
