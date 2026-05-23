import { BxContactRepository } from '../repository/bx-contact.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXContact } from '../interface/bx-contact.interface';
import { IBXField } from '../../fields/bx-field.interface';

export class BxContactService {
    private repo: BxContactRepository;

    clone(api: BitrixBaseApi): BxContactService {
        const instance = new BxContactService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxContactRepository(api);
    }

    async get(contactId: number) {
        return this.repo.get(contactId);
    }

    async getList(filter: Partial<IBXContact>, select?: string[]) {
        return this.repo.getList(filter, select);
    }

    async set(data: Partial<IBXContact>) {
        return await this.repo.set(data);
    }

    async update(contactId: number | string, data: Partial<IBXContact>) {
        return await this.repo.update(contactId, data);
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

    async all(filter: Partial<IBXContact>, select?: string[]) {
        const contacts: IBXContact[] = [];
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
            nextId = Number(result[result.length - 1]?.ID) || 0;
            if (nextId === 0) {
                needMore = false;
            }
            contacts.push(...result);
        }
        return contacts;
    }
}
