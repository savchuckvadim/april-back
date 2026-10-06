import { BxDealRepository } from '../repository/bx-deal.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXDeal, IBXDealContactBinding } from '../interface/bx-deal.interface';
import { IBXField } from '../../fields/bx-field.interface';

/** Страница `crm.deal.list` — 50 записей, Битрикс её не меняет. */
const DEAL_LIST_PAGE_SIZE = 50;

export class BxDealService {
    private repo: BxDealRepository;

    clone(api: BitrixBaseApi): BxDealService {
        const instance = new BxDealService();
        instance.init(api);
        return instance;
    }

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
        /** `-1` — без подсчёта total (см. BxDealRepository.getList). */
        start?: number,
    ) {
        return await this.repo.getList(filter, select, order, start);
    }

    /**
     * Все сделки по фильтру: курсор `>ID` по возрастанию.
     *
     * `start: -1` — Битрикс не считает общее число записей на каждой
     * странице (на воронке в тысячи сделок подсчёт дороже самой выборки).
     * Остановка — по неполной странице: раньше обход всегда заканчивался
     * лишним запросом за пустой.
     */
    async all(filter: Partial<IBXDeal>, select?: string[]) {
        const deals: IBXDeal[] = [];
        let nextId = 0;
        for (;;) {
            const fullFilter = { ...filter, '>ID': nextId };
            const { result } = await this.repo.getList(
                fullFilter,
                select,
                { ID: 'ASC' },
                -1,
            );
            if (!result?.length) break;
            deals.push(...result);
            nextId = Number(result[result.length - 1]?.ID ?? 0);
            if (!nextId || result.length < DEAL_LIST_PAGE_SIZE) break;
        }
        return deals;
    }

    async set(data: Partial<IBXDeal>) {
        return await this.repo.set(data);
    }

    async update(dealId: number | string, data: Partial<IBXDeal>) {
        return await this.repo.update(dealId, data);
    }

    async getFieldsList(filter?: { [key: string]: any }, select?: string[]) {
        return await this.repo.getFieldList(filter || {}, select);
    }

    async getField(id: number | string) {
        return await this.repo.getField(id);
    }

    async setField(fields: Partial<IBXField>) {
        return await this.repo.setField(fields);
    }

    async updateField(id: number | string, fields: Partial<IBXField>) {
        return await this.repo.updateField(id, fields);
    }

    async deleteField(id: number | string) {
        return await this.repo.deleteField(id);
    }

    async contactItemsSet(
        dealId: number | string,
        contactIds: number[] | string[],
    ) {
        return await this.repo.contactItemsSet(dealId, contactIds);
    }

    /** Привязать один контакт к сделке, не трогая остальные. */
    async contactAdd(dealId: number | string, fields: IBXDealContactBinding) {
        return await this.repo.contactAdd(dealId, fields);
    }

    /** Все контакты сделки (множественная связь). */
    async contactItemsGet(dealId: number | string) {
        return await this.repo.contactItemsGet(dealId);
    }

    /** Очищает набор контактов сделки. */
    async contactItemsDelete(dealId: number | string) {
        return await this.repo.contactItemsDelete(dealId);
    }
}
