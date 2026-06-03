import { Injectable } from '@nestjs/common';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXDialogMessagesGetRequest } from '../interface/bx-dialog-message.interface';
import { BxDialogMessageRepository } from '../repository/bx-dialog-message.repository';

@Injectable()
export class BxDialogMessageBatchService {
    private repo: BxDialogMessageRepository;

    clone(api: BitrixBaseApi): BxDialogMessageBatchService {
        const instance = new BxDialogMessageBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxDialogMessageRepository(api);
    }

    get(cmdCode: string, data: IBXDialogMessagesGetRequest) {
        return this.repo.getBtch(cmdCode, data);
    }
}
