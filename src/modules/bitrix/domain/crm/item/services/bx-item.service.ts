import { Injectable } from "@nestjs/common";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { BxItemRepository } from "../repository/bx-item.repository";
import { IBXItem } from "../interface/item.interface";
import { BitrixOwnerTypeId } from "../../../enums/bitrix-constants.enum";


export class BxItemService {
    private repo: BxItemRepository

    clone(api: BitrixBaseApi): BxItemService {
        const instance = new BxItemService();
        instance.init(api);
        return instance;
    }


    init(api: BitrixBaseApi) {
        this.repo = new BxItemRepository(api);
    }


    update(id: number | string, entityTypeId: BitrixOwnerTypeId.DEAL, data: Partial<IBXItem>) {
        return this.repo.update(id, entityTypeId, data);
    }

    list(entityTypeId: string, filter?: Partial<IBXItem>, select?: string[]) {
        return this.repo.list(entityTypeId, filter, select);
    }

    get(id: number | string, entityTypeId: string, select?: string[]) {
        return this.repo.get(id, entityTypeId, select);
    }

    add(entityTypeId: string, data: Partial<IBXItem>) {
        return this.repo.add(entityTypeId, data);
    }

}