import { BxSonetGroupRepository } from '../repository/sonet-group.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXSonetGroupCreateFields,
    IBXSonetGroupUpdateFields,
    ISonetGroupFilter,
    ISonetGroupOrder,
} from '../interface/sonet-group.interface';

/**
 * Batch-сервис рабочих групп `sonet_group.*` (накопление команд).
 */
export class BxSonetGroupBatchService {
    private repo: BxSonetGroupRepository;

    clone(api: BitrixBaseApi): BxSonetGroupBatchService {
        const instance = new BxSonetGroupBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxSonetGroupRepository(api);
    }

    /**
     * Создаёт рабочую группу / проект (batch)
     */
    add(cmdCode: string, fields: IBXSonetGroupCreateFields) {
        return this.repo.addBtch(cmdCode, fields);
    }

    /**
     * Изменяет параметры группы (batch)
     */
    update(
        cmdCode: string,
        groupId: number | string,
        fields: IBXSonetGroupUpdateFields,
    ) {
        return this.repo.updateBtch(cmdCode, groupId, fields);
    }

    /**
     * Получает список групп (batch)
     */
    get(cmdCode: string, filter?: ISonetGroupFilter, order?: ISonetGroupOrder) {
        return this.repo.getBtch(cmdCode, filter, order);
    }

    /**
     * Удаляет группу (batch)
     */
    delete(cmdCode: string, groupId: number | string) {
        return this.repo.deleteBtch(cmdCode, groupId);
    }
}
