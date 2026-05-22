import { BxRpaStageRepository } from '../repository/bx-rpa-stage.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBxRpaStage } from '../interface/bx-rpa-stage.interface';

export class BxRpaStageService {
    private repo: BxRpaStageRepository;

    clone(api: BitrixBaseApi): BxRpaStageService {
        const instance = new BxRpaStageService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxRpaStageRepository(api);
    }

    async add(fields: Partial<IBxRpaStage>) {
        return await this.repo.add(fields);
    }

    async update(id: number | string, fields: Partial<IBxRpaStage>) {
        return await this.repo.update(id, fields);
    }

    async listForType(typeId: number | string) {
        return await this.repo.listForType(typeId);
    }
}
