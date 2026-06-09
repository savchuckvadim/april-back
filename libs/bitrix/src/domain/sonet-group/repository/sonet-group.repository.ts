import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from 'src/modules/bitrix/core/domain/consts/bitrix-api.enum';
import { EBXEntity } from 'src/modules/bitrix/core/domain/consts/bitrix-entities.enum';
import {
    IBXSonetGroupCreateFields,
    IBXSonetGroupUpdateFields,
    ISonetGroupFilter,
    ISonetGroupOrder,
} from '../interface/sonet-group.interface';

/**
 * Low-level вызовы рабочих групп `sonet_group.*`.
 * Группа — entity-less метод: namespace `sonet_group` + пустая entity.
 */
export class BxSonetGroupRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    /**
     * Создаёт рабочую группу / проект
     */
    async add(fields: IBXSonetGroupCreateFields) {
        return this.bxApi.callType(
            EBxNamespace.SONET_GROUP,
            EBXEntity.SONET_GROUP,
            EBxMethod.ADD,
            fields,
        );
    }

    /**
     * Создаёт рабочую группу / проект (batch)
     */
    addBtch(cmdCode: string, fields: IBXSonetGroupCreateFields) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.SONET_GROUP,
            EBXEntity.SONET_GROUP,
            EBxMethod.ADD,
            fields,
        );
    }

    /**
     * Изменяет параметры группы
     */
    async update(groupId: number | string, fields: IBXSonetGroupUpdateFields) {
        return this.bxApi.callType(
            EBxNamespace.SONET_GROUP,
            EBXEntity.SONET_GROUP,
            EBxMethod.UPDATE,
            { GROUP_ID: groupId, ...fields },
        );
    }

    /**
     * Изменяет параметры группы (batch)
     */
    updateBtch(
        cmdCode: string,
        groupId: number | string,
        fields: IBXSonetGroupUpdateFields,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.SONET_GROUP,
            EBXEntity.SONET_GROUP,
            EBxMethod.UPDATE,
            { GROUP_ID: groupId, ...fields },
        );
    }

    /**
     * Получает список групп
     */
    async get(filter?: ISonetGroupFilter, order?: ISonetGroupOrder) {
        return this.bxApi.callType(
            EBxNamespace.SONET_GROUP,
            EBXEntity.SONET_GROUP,
            EBxMethod.GET,
            { FILTER: filter, ORDER: order },
        );
    }

    /**
     * Получает список групп (batch)
     */
    getBtch(
        cmdCode: string,
        filter?: ISonetGroupFilter,
        order?: ISonetGroupOrder,
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.SONET_GROUP,
            EBXEntity.SONET_GROUP,
            EBxMethod.GET,
            { FILTER: filter, ORDER: order },
        );
    }

    /**
     * Удаляет группу
     */
    async delete(groupId: number | string) {
        return this.bxApi.callType(
            EBxNamespace.SONET_GROUP,
            EBXEntity.SONET_GROUP,
            EBxMethod.DELETE,
            { GROUP_ID: groupId },
        );
    }

    /**
     * Удаляет группу (batch)
     */
    deleteBtch(cmdCode: string, groupId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.SONET_GROUP,
            EBXEntity.SONET_GROUP,
            EBxMethod.DELETE,
            { GROUP_ID: groupId },
        );
    }
}
