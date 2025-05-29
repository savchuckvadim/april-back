import { Injectable } from "@nestjs/common";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { BxItemRepository } from "../repository/bx-item.repository";
import { IBXItem } from "../interface/item.interface";
import { BitrixOwnerTypeId } from "../../../enums/bitrix-constants.enum";

@Injectable()
export class BxItemBatchService {
    private repo: BxItemRepository
    constructor(

    ) {

    }

    init(api: BitrixBaseApi) {
        this.repo = new BxItemRepository(api);
    }

    update(cmdCode: string, id: number | string, entityTypeId: BitrixOwnerTypeId.DEAL, data: Partial<IBXItem>) {
        return this.repo.updateBtch(cmdCode, id, entityTypeId, data);
    }

}
