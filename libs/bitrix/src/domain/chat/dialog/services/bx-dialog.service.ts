import { BxDialogRepository } from '../repository/bx-dialog.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXChatAddRequest,
    IBXChatGetRequest,
    IBXDialogGetRequest,
} from '../interface/bx-dialog.interface';

export class BxDialogService {
    private repo: BxDialogRepository;

    clone(api: BitrixBaseApi): BxDialogService {
        const instance = new BxDialogService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxDialogRepository(api);
    }

    async chatAdd(data: IBXChatAddRequest) {
        return await this.repo.chatAdd(data);
    }

    async chatGet(data: IBXChatGetRequest) {
        return await this.repo.chatGet(data);
    }

    async countersGet() {
        return await this.repo.countersGet();
    }

    async dialogGet(data: IBXDialogGetRequest) {
        return await this.repo.dialogGet(data);
    }
}
