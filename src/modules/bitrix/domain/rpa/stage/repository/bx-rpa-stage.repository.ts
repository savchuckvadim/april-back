import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBxRpaStage } from '../interface/bx-rpa-stage.interface';

export class BxRpaStageRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async add(fields: Partial<IBxRpaStage>) {
        return this.bxApi.call('rpa.stage.add', { fields });
    }

    async update(id: number | string, fields: Partial<IBxRpaStage>) {
        return this.bxApi.call('rpa.stage.update', { id, fields });
    }

    async listForType(typeId: number | string) {
        return this.bxApi.call('rpa.stage.listForType', { typeId });
    }
}
