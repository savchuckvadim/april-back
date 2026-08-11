import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxImNotifyRepository } from '../repository/bx-im-notify.repository';
import { IBXImNotifySystemAdd } from '../interface/bx-im-notify.interface';

/**
 * Системные уведомления портала (im.notify.system.add): SLA-алерты
 * руководителю, служебные сообщения пользователям.
 */
export class BxImNotifyService {
    private repo: BxImNotifyRepository;

    clone(api: BitrixBaseApi): BxImNotifyService {
        const instance = new BxImNotifyService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxImNotifyRepository(api);
    }

    async systemAdd(data: IBXImNotifySystemAdd) {
        return await this.repo.systemAdd(data);
    }
}
