import { Injectable } from '@nestjs/common';
import { BxDealRepository } from '../repository/bx-deal.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXDeal } from '../interface/bx-deal.interface';

export class BxDealService {
    clone(api: BitrixBaseApi): BxDealService {
        const instance = new BxDealService();
        instance.init(api);
        return instance;
    }

    private repo: BxDealRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxDealRepository(api);
    }

    async get(dealId: number, select?: string[]) {
        return await this.repo.get(dealId, select);
    }
    async getList(
        filter: Partial<IBXDeal>,
        select?: string[],
        order?: { [key in keyof IBXDeal]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
    ) {
        return await this.repo.getList(filter, select, order);
    }
    async all(filter: Partial<IBXDeal>, select?: string[]) {
        const deals: IBXDeal[] = [];
        let needMore = true;
        let nextId = 0;
        while (needMore) {
            const fullFilter = {
                ...filter,
                '>ID': nextId,
            };
            const { result } = await this.repo.getList(fullFilter, select, {
                ID: 'ASC',
            });
            if (result.length === 0) {
                break;
            }
            nextId = result[result.length - 1]?.ID ?? 0;
            if (nextId === 0) {
                needMore = false;
            }
            deals.push(...result);
        }
        return deals;
    }
    async set(data: Partial<IBXDeal>) {
        return await this.repo.set(data);
    }
    async update(dealId: number | string, data: Partial<IBXDeal>) {
        return await this.repo.update(dealId, data);
    }
    async getFieldsList(filter: { [key: string]: any }, select?: string[]) {
        return await this.repo.getFieldList(filter, select);
    }
    async getField(id: number | string) {
        return await this.repo.getField(id);
    }
    async contactItemsSet(
        dealId: number | string,
        contactIds: number[] | string[],
    ) {
        return await this.repo.contactItemsSet(dealId, contactIds);
    }
}
