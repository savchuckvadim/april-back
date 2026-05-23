import { BitrixService, IBXCompany, IBXDeal, IBXLead } from '@/modules/bitrix';
import { PortalModel } from 'src/modules/portal/services/portal.model';
import { EventEntityModel } from './event-entity.model';
import { EnumColdCallEntityType } from '../../../dto/cold.dto';
import { Logger } from '@nestjs/common';

export interface IColdCallBxEntityData {
    name: string;
    deadline: string;
    responsible: string;
    xoCreated: string;
    entity: IBXCompany | IBXLead | IBXDeal;
    entityType: EnumColdCallEntityType;
}
const eventPrefix = 'xo_hook_update_event_entity_';
export class ColdCallBxEntityService {
    private readonly logger = new Logger(ColdCallBxEntityService.name);
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    flow(data: IColdCallBxEntityData) {
        const { name, deadline, responsible, xoCreated, entity, entityType } =
            data;
        if (!entity) return;
        const now = new Date();
        const commentNow = now.toLocaleString('ru-RU', {
            day: '2-digit',
            month: 'long',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
        });
        const comment = commentNow + ' Запланирован на ' + deadline;
        const eventEntity = new EventEntityModel(
            this.portal,
            entity,
            entityType,
            name,
            comment,
            deadline,
            responsible,
            xoCreated,
        );
        const nextValues = eventEntity.getNextValues();

        void this.bitrix.batch[entityType].update(
            `${eventPrefix}${entity.ID}`,
            entity.ID,
            nextValues,
        );
    }
}
