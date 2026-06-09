import { BxRequisitePresetRepository } from '../repository/bx-requisite-preset.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXRequisitePreset } from '../interface/bx-requisite-preset.interface';

/**
 * Пресеты реквизитов Bitrix24 (`crm.requisite.preset.*`).
 * Инстанс привязан к конкретному порталу через {@link clone}/{@link init}.
 */
export class BxRequisitePresetService {
    private repo: BxRequisitePresetRepository;

    clone(api: BitrixBaseApi): BxRequisitePresetService {
        const instance = new BxRequisitePresetService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxRequisitePresetRepository(api);
    }

    async get(id: number | string, select?: string[]) {
        return await this.repo.get(id, select);
    }

    async getList(
        filter: Partial<IBXRequisitePreset> = {},
        select?: string[],
        order?: {
            [key in keyof IBXRequisitePreset]?: 'asc' | 'desc' | 'ASC' | 'DESC';
        },
    ) {
        return await this.repo.getList(filter, select, order);
    }

    async add(data: Partial<IBXRequisitePreset>) {
        return await this.repo.add(data);
    }

    async update(id: number | string, data: Partial<IBXRequisitePreset>) {
        return await this.repo.update(id, data);
    }

    async delete(id: number | string) {
        return await this.repo.delete(id);
    }

    async getCountries() {
        return await this.repo.getCountries();
    }
}
