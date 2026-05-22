import { BxLeadRepository } from '../repository/bx-lead.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXLead } from '../interface/bx-lead.interface';
import { IBXField } from '../../fields/bx-field.interface';

export class BxLeadService {
    private repo: BxLeadRepository;

    clone(api: BitrixBaseApi): BxLeadService {
        const instance = new BxLeadService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxLeadRepository(api);
    }

    async get(leadId: number, select?: string[]) {
        return await this.repo.get(leadId, select);
    }

    async getList(
        filter: Partial<IBXLead>,
        select?: string[],
        order?: { [key in keyof IBXLead]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
    ) {
        return await this.repo.getList(filter, select, order);
    }

    async all(filter: Partial<IBXLead>, select?: string[]) {
        const leads: IBXLead[] = [];
        let needMore = true;
        let nextId = 0;
        while (needMore) {
            const fullFilter = { ...filter, '>ID': nextId };
            const { result } = await this.repo.getList(fullFilter, select, {
                ID: 'ASC',
            });
            if (result.length === 0) break;
            nextId = result[result.length - 1]?.ID ?? 0;
            if (nextId === 0) needMore = false;
            leads.push(...result);
        }
        return leads;
    }

    async add(data: Partial<IBXLead>) {
        return await this.repo.add(data);
    }

    async update(leadId: number | string, data: Partial<IBXLead>) {
        return await this.repo.update(leadId, data);
    }

    async delete(leadId: number | string) {
        return await this.repo.delete(leadId);
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
