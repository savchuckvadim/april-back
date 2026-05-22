import { BxDialogRepository } from '../repository/bx-dialog.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXChatAddRequest,
    IBXChatGetRequest,
    IBXDialogGetRequest,
} from '../interface/bx-dialog.interface';

export class BxDialogBatchService {
    private repo: BxDialogRepository;

    clone(api: BitrixBaseApi): BxDialogBatchService {
        const instance = new BxDialogBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxDialogRepository(api);
    }

    chatAdd(cmdCode: string, data: IBXChatAddRequest) {
        return this.repo.chatAddBtch(cmdCode, data);
    }

    chatGet(cmdCode: string, data: IBXChatGetRequest) {
        return this.repo.chatGetBtch(cmdCode, data);
    }

    countersGet(cmdCode: string) {
        return this.repo.countersGetBtch(cmdCode);
    }

    dialogGet(cmdCode: string, data: IBXDialogGetRequest) {
        return this.repo.dialogGetBtch(cmdCode, data);
    }
}
