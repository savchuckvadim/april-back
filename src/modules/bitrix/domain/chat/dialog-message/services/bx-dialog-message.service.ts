import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXDialogMessagesGetRequest } from '../interface/bx-dialog-message.interface';
import { BxDialogMessageRepository } from '../repository/bx-dialog-message.repository';

export class BxDialogMessageService {
    private repo: BxDialogMessageRepository;

    clone(api: BitrixBaseApi): BxDialogMessageService {
        const instance = new BxDialogMessageService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxDialogMessageRepository(api);
    }

    async get(data: IBXDialogMessagesGetRequest) {
        return await this.repo.get(data);
    }
}
