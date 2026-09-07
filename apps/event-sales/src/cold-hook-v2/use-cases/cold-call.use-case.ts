import { BitrixService, IBXDeal, IBXLead } from '@/modules/bitrix';
import { ColdTarget } from '../services/target/cold-target.types';
import { ownerFromTarget } from '../services/enities/cold-owner.type';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    ColdCallBxEntityFlowService,
    IColdCallBxEntityData,
} from '../services/enities/entity/cold-call-bx-entity.flow.service';
// import { Logger } from '@nestjs/common';
import { ColdDealFlowService } from '../services/enities/deal/cold-deal.flow.service';
// Буфер — ОДИН на все хуки (правило SALES_HOOKS_GUIDE): своей копии у v2 нет.
import { SalesBatchGroupBuffer as ColdHookBatchGroupBuffer } from '../../shared/batch';
import {
    ColdTaskFlowService,
    IColdTaskFlow,
} from '../services/enities/task/cold-tasks.flow.service';
import { ColdListFlowService } from '../services/enities/kpi-list/cold-list.flow.service';
import { BitrixDateTime } from '@lib/shared/lib/date';
import { EnumColdCallEntityType } from '../dto/cold.dto';
import { IColdCallEventData } from '../services/enities/entity/cold-call-bx-entity.flow.service';

export class ColdCallV2UseCase {
    // private readonly logger = new Logger(ColdCallV2UseCase.name);
    constructor(
        private readonly portal: PortalModel,
        private readonly bitrix: BitrixService,
    ) {}

    /**
     * Одна цель = одна группа в буфере. Все команды цели (update владельца,
     * base/cold deal upsert, task add, list.element add) гарантированно
     * уходят в один HTTP-batch — $result[cmdKey] валиден между сделкой →
     * задачей → элементом списка.
     *
     * Корень-компания — как v1; корень-сделка (v2, шаг 6): отдельного
     * update владельца нет (основную и так пишет deal-flow), сделки без
     * COMPANY_ID, привязки через сделки/лид/контакт входной.
     * `lead` пока не используется — параметр оставлен под работу с лидом.
     */
    async flow(
        target: ColdTarget,
        baseDeal: IBXDeal | null,
        lead: IBXLead | null,
        buffer: ColdHookBatchGroupBuffer,
    ) {
        const data = target.hook;
        const owner = ownerFromTarget(target);
        const deadline = BitrixDateTime.fromPortalInput(
            data.deadline,
            this.portal.getTimezone(),
        );

        const dealsFlowService = new ColdDealFlowService(
            this.bitrix,
            this.portal,
        );
        const entityFlowService = new ColdCallBxEntityFlowService(
            this.bitrix,
            this.portal,
        );
        const taskFlowService = new ColdTaskFlowService(
            this.bitrix,
            this.portal,
        );
        const listFlowService = new ColdListFlowService(
            this.bitrix,
            this.portal,
        );
        const eventData: IColdCallEventData = {
            name: data.name,
            deadline,
            responsibleId: data.responsible,
            xoCreated: data.created,
        };
        if (target.kind === 'company' && target.company) {
            const entityFlowData: IColdCallBxEntityData = {
                ...eventData,
                entity: target.company,
                // Сущность-владелец здесь ВСЕГДА компания, каким бы ни был
                // вход хука: v1 брал тип из хука, и вход-сделка с компанией
                // (до v2 он сюда не доходил) обновил бы по batch.deal СДЕЛКУ
                // с id компании.
                entityType: EnumColdCallEntityType.COMPANY,
            };
            entityFlowService.flow(entityFlowData, buffer);
        }
        const { baseDealId, xoDealId } = dealsFlowService.flow(
            eventData,
            owner,
            baseDeal,
            buffer,
        );

        const taskFlowData: IColdTaskFlow = {
            deadline,
            responsibleId: Number(data.responsible),
            owner,
            baseDealId,
            xoDealId,
            name: data.name,
        };
        taskFlowService.createNextTask(taskFlowData, buffer);

        /**
         * KPI + History элементы.
         * Создаются в этом же HTTP-batch, что и сделки/задача —
         * crm-поле элемента ссылается на $result[...] сделок.
         */
        listFlowService.flow(
            {
                name: data.name,
                deadline,
                createdId: data.created,
                responsibleId: data.responsible,
                owner,
                baseDealId,
                xoDealId,
            },
            buffer,
        );
        void lead;

        await buffer.endGroup();
    }
}
