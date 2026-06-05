import { BxImBotDialogRepository } from '../repository/bx-imbot-dialog.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXImBotDialogGetRequest } from '../interface/bx-imbot-dialog.interface';

export class BxImBotDialogService {
    clone(api: BitrixBaseApi): BxImBotDialogService {
        const instance = new BxImBotDialogService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotDialogRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotDialogRepository(api);
    }

    async get(data: IBXImBotDialogGetRequest) {
        return await this.repo.get(data);
    }
}
