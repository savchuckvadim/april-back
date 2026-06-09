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

    async add(fields: Partial<IBxRpaStage>): Promise<unknown> {
        return this.repo.add(fields);
    }

    async update(
        id: number | string,
        fields: Partial<IBxRpaStage>,
    ): Promise<unknown> {
        return this.repo.update(id, fields);
    }

    async listForType(typeId: number | string): Promise<unknown> {
        return this.repo.listForType(typeId);
    }

    async delete(id: number | string): Promise<unknown> {
        return this.repo.delete(id);
    }
}
