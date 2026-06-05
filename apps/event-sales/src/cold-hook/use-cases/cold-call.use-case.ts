import { BitrixService, IBXCompany, IBXDeal, IBXLead } from '@/modules/bitrix';
import { IColdCallData } from '../type/cold-hook-silence.interface';
import { PortalModel } from '@lib/portal/services/portal.model';
import {
    ColdCallBxEntityFlowService,
    IColdCallBxEntityData,
} from '../services/enities/entity/cold-call-bx-entity.flow.service';
import { Logger } from '@nestjs/common';
import { ColdDealFlowService } from '../services/enities/deal/cold-deal.flow.service';
import { ColdHookBatchGroupBuffer } from '../services/batch/cold-hook-batch-group-buffer';
import {
    ColdTaskFlowService,
    IColdTaskFlow,
} from '../services/enities/task/cold-tasks.flow.service';
import { ColdListFlowService } from '../services/enities/kpi-list/cold-list.flow.service';

export class ColdCallUseCase {
    private readonly logger = new Logger(ColdCallUseCase.name);
    constructor(
        private readonly portal: PortalModel,
        private readonly bitrix: BitrixService,
    ) {}

    /**
     * Одна компания = одна группа в буфере. Все команды этой компании
     * (company update, base/cold deal upsert, task add, list.element add)
     * гарантированно уходят в один HTTP-batch — $result[cmdKey] валиден
     * между сделкой → задачей → элементом списка.
     */
    async flow(
        data: IColdCallData,
        company: IBXCompany,
        baseDeal: IBXDeal | null,
        lead: IBXLead | null,
        buffer: ColdHookBatchGroupBuffer,
    ) {
        this.logger.log('flow', company?.ID);

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
        const entityFlowData: IColdCallBxEntityData = {
            name: data.name,
            deadline: data.deadline,
            responsibleId: data.responsible,
            xoCreated: data.created,
            entity: company,
            entityType: data.entityType,
        };
        entityFlowService.flow(entityFlowData, buffer);
        const { baseDealId, xoDealId } = dealsFlowService.flow(
            entityFlowData,
            Number(company.ID),
            baseDeal,
            buffer,
        );

        const taskFlowData: IColdTaskFlow = {
            deadline: data.deadline,
            responsibleId: Number(data.responsible),
            companyId: Number(company.ID),
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
                deadline: data.deadline,
                createdId: data.created,
                responsibleId: data.responsible,
                companyId: company.ID,
                baseDealId,
                xoDealId,
            },
            buffer,
        );

        await buffer.endGroup();
    }
}
