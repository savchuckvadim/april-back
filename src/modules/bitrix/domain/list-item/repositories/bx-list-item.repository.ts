import { BitrixBaseApi, EBXEntity, EBxMethod, EBxNamespace } from "@/modules/bitrix";
import { BxListItemGetRequestDto } from "../dto/bx-list-item.dto";

export class BxListItemRepository {
    constructor(private readonly bitrix: BitrixBaseApi) {
    }

    async get(dto: BxListItemGetRequestDto){
        return await this.bitrix.callType(
            EBxNamespace.LISTS,
            EBXEntity.ELEMENT,
            EBxMethod.GET, {
            IBLOCK_TYPE_ID: 'lists',
            ...dto,
        });
    }
}
