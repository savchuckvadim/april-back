import { BitrixService, IBXCompany, IBXDeal, IBXLead } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventEntityModel } from './event-entity.model';
import { EnumColdCallEntityType } from '../../../dto/cold.dto';
import { Logger } from '@nestjs/common';
import { SalesBatchGroupBuffer as ColdHookBatchGroupBuffer } from '../../../../shared/batch';
import { BitrixDateTime } from '@lib/shared/lib/date';

/** Данные события холодного старта, общие для всех писателей. */
export interface IColdCallEventData {
    name: string;
    deadline: BitrixDateTime;
    responsibleId: string;
    xoCreated: string;
}

/** + сущность-владелец, в которую пишутся поля ХО (компания у v1/v2). */
export interface IColdCallBxEntityData extends IColdCallEventData {
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
        /*
         * Адресный ХО переназначает и владельца (решение 17.09 «новый
         * ответственный везде»): до этого компания оставалась на прежнем
         * сотруднике, хотя вся её работа уже уехала новому.
         */
        const nextValues = {
            ...eventEntity.getNextValues(),
            ...(Number(responsibleId) > 0
                ? { ASSIGNED_BY_ID: String(responsibleId) }
                : {}),
        };

        this.logger.log(
            `[DEADLINE][entity][SEND] ${entityType}.update id=${entity.ID} ` +
                `cmdKey=${eventPrefix}${entityType}_${entity.ID} ` +
                `deadlineCrm="${deadline.toCrmDateTime()}" (локаль портала) ` +
                `nextValues=${JSON.stringify(nextValues)}`,
        );
        buffer.queue(() =>
            this.bitrix.batch[entityType].update(
                `${eventPrefix}${entityType}_${entity.ID}`,
                entity.ID,
                nextValues,
            ),
        );
    }
}
