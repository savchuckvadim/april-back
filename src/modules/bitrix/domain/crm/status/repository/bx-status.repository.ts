import { BitrixBaseApi } from 'src/modules/bitrix/core';
import { EBxMethod, EBxNamespace, EBXEntity } from 'src/modules/bitrix/';
import { IBXStatus } from '../interface/bx-status.interface';
import {
    StatusEntityItemsRequestDto,
    StatusEntityItemsResponseDto,
    StatusEntityTypesResponseDto,
} from '../dto/status-entity.dto';

export class BxStatusRepository {
    constructor(private readonly bxApi: BitrixBaseApi) { }

    async getList(filter: Partial<IBXStatus>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.STATUS,
            EBxMethod.LIST,
            { filter },
        );
    }

    /**
     * Возвращает элементы справочника по его символьному идентификатору
     * @param dto - DTO с entityId (например, 'DEAL_STAGE', 'SOURCE')
     * @returns Массив элементов справочника
     */
    async getEntityItems(
        dto: StatusEntityItemsRequestDto,
    ): Promise<StatusEntityItemsResponseDto> {
        return this.bxApi.call('crm.status.entity.items', {
            entityId: dto.entityId,
        });
    }

    /**
     * Возвращает описание типов справочников
     * @returns Массив объектов с описанием типов справочников
     */
    async getEntityTypes(): Promise<StatusEntityTypesResponseDto> {
        return this.bxApi.call('crm.status.entity.types', {});
    }
}
