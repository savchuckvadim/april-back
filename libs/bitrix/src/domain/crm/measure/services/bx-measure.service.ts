import { BxMeasureRepository } from '../repository/bx-measure.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBxMeasure } from '../interface/bx-measure.interface';

export class BxMeasureService {
    private repo: BxMeasureRepository;

    clone(api: BitrixBaseApi): BxMeasureService {
        const instance = new BxMeasureService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxMeasureRepository(api);
    }

    getList() {
        return this.repo.getList();
    }

    async get(id: number | string) {
        return await this.repo.get(id);
    }

    async add(fields: Partial<IBxMeasure>) {
        return await this.repo.add(fields);
    }

    async update(id: number | string, fields: Partial<IBxMeasure>) {
        return await this.repo.update(id, fields);
    }

    async delete(id: number | string) {
        return await this.repo.delete(id);
    }
}
