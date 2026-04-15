import { BxRequisiteRepository } from '../repository/bx-requisite.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXRequisite } from '../interface/bx-requisite.interface';
import { IBXField } from '../../fields/bx-field.interface';

export class BxRequisiteService {
    private repo: BxRequisiteRepository;

    clone(api: BitrixBaseApi): BxRequisiteService {
        const instance = new BxRequisiteService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxRequisiteRepository(api);
    }

    async get(id: number, select?: string[]) {
        return await this.repo.get(id, select);
    }

    async getList(
        filter: Partial<IBXRequisite>,
        select?: string[],
        order?: {
            [key in keyof IBXRequisite]?: 'asc' | 'desc' | 'ASC' | 'DESC';
        },
    ) {
        return await this.repo.getList(filter, select, order);
    }

    async add(data: Partial<IBXRequisite>) {
        return await this.repo.add(data);
    }

    async update(id: number | string, data: Partial<IBXRequisite>) {
        return await this.repo.update(id, data);
    }

    async delete(id: number | string) {
        return await this.repo.delete(id);
    }

    async getFieldsList(filter: { [key: string]: any }, select?: string[]) {
        return await this.repo.getFieldList(filter, select);
    }

    async getField(id: number | string) {
        return await this.repo.getField(id);
    }

    async addField(fields: Partial<IBXField>) {
        return await this.repo.addField(fields);
    }

    async updateField(id: number | string, fields: Partial<IBXField>) {
        return await this.repo.updateField(id, fields);
    }

    async deleteField(id: number | string) {
        return await this.repo.deleteField(id);
    }
}
