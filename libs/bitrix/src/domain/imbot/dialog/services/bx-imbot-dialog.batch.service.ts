import { Injectable } from '@nestjs/common';
import { BxImBotDialogRepository } from '../repository/bx-imbot-dialog.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXImBotDialogGetRequest } from '../interface/bx-imbot-dialog.interface';

@Injectable()
export class BxImBotDialogBatchService {
    clone(api: BitrixBaseApi): BxImBotDialogBatchService {
        const instance = new BxImBotDialogBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotDialogRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotDialogRepository(api);
    }

    get(cmdCode: string, data: IBXImBotDialogGetRequest) {
        return this.repo.getBtch(cmdCode, data);
    }
}
