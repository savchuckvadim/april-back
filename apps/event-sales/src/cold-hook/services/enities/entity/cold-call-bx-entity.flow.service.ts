import { BitrixService, IBXCompany, IBXDeal, IBXLead } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal/services/portal.model';
import { EventEntityModel } from './event-entity.model';
import { EnumColdCallEntityType } from '../../../dto/cold.dto';
import { Logger } from '@nestjs/common';
import { ColdHookBatchGroupBuffer } from '../../batch/cold-hook-batch-group-buffer';

export interface IColdCallBxEntityData {
    name: string;
    deadline: string;
    responsibleId: string;
    xoCreated: string;
    entity: IBXCompany | IBXLead | IBXDeal;
    entityType: EnumColdCallEntityType;
}
const eventPrefix = 'xo_hook_update_event_entity_';
export class ColdCallBxEntityFlowService {
    private readonly logger = new Logger(ColdCallBxEntityFlowService.name);
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    flow(data: IColdCallBxEntityData, buffer: ColdHookBatchGroupBuffer) {
        const { name, deadline, responsibleId, xoCreated, entity, entityType } =
            data;
        if (!entity) return;

        const eventEntity = new EventEntityModel(
            this.portal,
            entity,
            entityType,
            name,
            deadline,
            responsibleId,
            xoCreated,
        );
        const nextValues = eventEntity.getNextValues();

        buffer.queue(() =>
            this.bitrix.batch[entityType].update(
                `${eventPrefix}${entityType}_${entity.ID}`,
                entity.ID,
                nextValues,
            ),
        );
    }
}
