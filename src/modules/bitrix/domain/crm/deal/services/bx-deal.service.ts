import { Injectable } from "@nestjs/common";
import { BxDealRepository } from "../repository/bx-deal.repository";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { IBXDeal } from "../interface/bx-deal.interface";

@Injectable()
export class BxDealService {
    private repo: BxDealRepository
    constructor() { }


    init(api: BitrixBaseApi) {
        this.repo = new BxDealRepository(api);
    }

    get(dealId: number) {
        return this.repo.get(dealId);
    }
    getList(filter: Partial<IBXDeal>, select?: string[], order?: { [key in keyof IBXDeal]?: 'asc' | 'desc' | 'ASC' | 'DESC' }) {
        return this.repo.getList(filter, select, order);
    }
    set(data: { [key: string]: any }) {
        return this.repo.set(data);
    }
    update(dealId: number | string, data: { [key: string]: any }) {
        return this.repo.update(dealId, data);
    }
    getFieldsList(filter: { [key: string]: any }, select?: string[]) {
        return this.repo.getFieldList(filter, select);
    }
    getField(id: number | string) {
        return this.repo.getField(id);
    }
    contactItemsSet(dealId: number | string, contactIds: number[] | string[]) {
        return this.repo.contactItemsSet(dealId, contactIds);
    }


}