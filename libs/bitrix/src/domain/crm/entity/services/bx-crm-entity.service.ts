import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxCrmEntityRepository } from '../repository/bx-crm-entity.repository';
import { IBXMergeBatchParams } from '../interface/bx-crm-entity.interface';

/**
 * crm.entity.mergeBatch — объединение однотипных CRM-сущностей.
 *
 * ОПАСНАЯ ОПЕРАЦИЯ: данные сливаются в ПЕРВЫЙ элемент `entityIds`,
 * остальные удаляются безвозвратно. Вызывающий код обязан гарантировать,
 * что survivor стоит первым, и не запускать метод без dry-run подтверждения.
 * Batch-сервиса у домена нет сознательно — см. комментарий в репозитории.
 */
export class BxCrmEntityService {
    private repo: BxCrmEntityRepository;

    clone(api: BitrixBaseApi): BxCrmEntityService {
        const instance = new BxCrmEntityService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxCrmEntityRepository(api);
    }

    async mergeBatch(params: IBXMergeBatchParams) {
        return await this.repo.mergeBatch(params);
    }
}
