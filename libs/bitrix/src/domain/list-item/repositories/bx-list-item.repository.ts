import {
    BitrixBaseApi,
    EBXEntity,
    EBxMethod,
    EBxNamespace,
} from '@/modules/bitrix';
import {
    BxListItemAddRequestType,
    BxListItemGetRequestType,
    BxListItemUpdateRequestType,
} from '../schema/bx-list-item.schema';

export class BxListItemRepository {
    constructor(private readonly bitrix: BitrixBaseApi) {}

    async get(dto: Omit<BxListItemGetRequestType, 'IBLOCK_TYPE_ID'>) {
        return await this.bitrix.callType(
            EBxNamespace.LISTS,
            EBXEntity.ELEMENT,
            EBxMethod.GET,
            {
                IBLOCK_TYPE_ID: 'lists',
                ...dto,
            },
        );
    }

    async add(dto: Omit<BxListItemAddRequestType, 'IBLOCK_TYPE_ID'>) {
        return await this.bitrix.callType(
            EBxNamespace.LISTS,
            EBXEntity.ELEMENT,
            EBxMethod.ADD,
            {
                IBLOCK_TYPE_ID: 'lists',
                ...dto,
            },
        );
    }

    addBtch(
        cmdCode: string,
        dto: Omit<BxListItemAddRequestType, 'IBLOCK_TYPE_ID'>,
    ) {
        return this.bitrix.addCmdBatchType(
            cmdCode,
            EBxNamespace.LISTS,
            EBXEntity.ELEMENT,
            EBxMethod.ADD,
            {
                IBLOCK_TYPE_ID: 'lists',
                ...dto,
            },
        );
    }

    async update(dto: Omit<BxListItemUpdateRequestType, 'IBLOCK_TYPE_ID'>) {
        return await this.bitrix.callType(
            EBxNamespace.LISTS,
            EBXEntity.ELEMENT,
            EBxMethod.UPDATE,
            {
                IBLOCK_TYPE_ID: 'lists',
                ...dto,
            },
        );
    }

    updateBtch(
        cmdCode: string,
        dto: Omit<BxListItemUpdateRequestType, 'IBLOCK_TYPE_ID'>,
    ) {
        return this.bitrix.addCmdBatchType(
            cmdCode,
            EBxNamespace.LISTS,
            EBXEntity.ELEMENT,
            EBxMethod.UPDATE,
            {
                IBLOCK_TYPE_ID: 'lists',
                ...dto,
            },
        );
    }
}
