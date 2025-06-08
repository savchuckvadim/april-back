import { Injectable } from "@nestjs/common";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { BxItemRepository } from "../repository/bx-item.repository";
import { IBXItem } from "../interface/item.interface";
import { BitrixOwnerTypeId } from "../../../enums/bitrix-constants.enum";


export class BxItemBatchService {
    private repo: BxItemRepository

    clone(api: BitrixBaseApi): BxItemBatchService {
        const instance = new BxItemBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxItemRepository(api);
    }

    update(cmdCode: string, id: number | string, entityTypeId: BitrixOwnerTypeId.DEAL, data: Partial<IBXItem>) {
        return this.repo.updateBtch(cmdCode, id, entityTypeId, data);
    }

}
