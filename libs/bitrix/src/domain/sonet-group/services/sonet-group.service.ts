import { BxSonetGroupRepository } from '../repository/sonet-group.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXSonetGroupCreateFields,
    IBXSonetGroupUpdateFields,
    ISonetGroupFilter,
    ISonetGroupOrder,
} from '../interface/sonet-group.interface';

/**
 * Сервис рабочих групп `sonet_group.*` (обычные вызовы).
 */
export class BxSonetGroupService {
    private repo: BxSonetGroupRepository;

    clone(api: BitrixBaseApi): BxSonetGroupService {
        const instance = new BxSonetGroupService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxSonetGroupRepository(api);
    }

    /**
     * Создаёт рабочую группу / проект
     */
    async add(fields: IBXSonetGroupCreateFields) {
        return this.repo.add(fields);
    }

    /**
     * Изменяет параметры группы
     */
    async update(groupId: number | string, fields: IBXSonetGroupUpdateFields) {
        return this.repo.update(groupId, fields);
    }

    /**
     * Получает список групп
     */
    async get(filter?: ISonetGroupFilter, order?: ISonetGroupOrder) {
        return this.repo.get(filter, order);
    }

    /**
     * Удаляет группу
     */
    async delete(groupId: number | string) {
        return this.repo.delete(groupId);
    }
}
