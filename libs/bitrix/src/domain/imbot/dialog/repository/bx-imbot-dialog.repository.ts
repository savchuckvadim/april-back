import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXImBotDialogGetRequest } from '../interface/bx-imbot-dialog.interface';

export class BxImBotDialogRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async get(data: IBXImBotDialogGetRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT,
            EBXEntity.DIALOG,
            EBxMethod.GET,
            data,
        );
    }

    getBtch(cmdCode: string, data: IBXImBotDialogGetRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IMBOT,
            EBXEntity.DIALOG,
            EBxMethod.GET,
            data,
        );
    }
}
