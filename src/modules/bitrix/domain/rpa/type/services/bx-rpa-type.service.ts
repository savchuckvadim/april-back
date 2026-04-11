import { BxRpaTypeRepository } from '../repository/bx-rpa-type.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBxRpaType } from '../interface/bx-rpa-type.interface';

export class BxRpaTypeService {
    private repo: BxRpaTypeRepository;

    clone(api: BitrixBaseApi): BxRpaTypeService {
        const instance = new BxRpaTypeService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxRpaTypeRepository(api);
    }

    async add(fields: Partial<IBxRpaType>) {
        return await this.repo.add(fields);
    }

    async get(id: number | string) {
        return await this.repo.get(id);
    }

    async getList() {
        return await this.repo.getList();
    }

    async update(id: number | string, fields: Partial<IBxRpaType>) {
        return await this.repo.update(id, fields);
    }

    async delete(id: number | string) {
        return await this.repo.delete(id);
    }
}
