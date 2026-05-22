import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXDialogMessagesGetRequest } from '../interface/bx-dialog-message.interface';

export class BxDialogMessageRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async get(data: IBXDialogMessagesGetRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IM,
            EBXEntity.DIALOG_MESSAGES,
            EBxMethod.GET,
            data,
        );
    }

    getBtch(cmdCode: string, data: IBXDialogMessagesGetRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IM,
            EBXEntity.DIALOG_MESSAGES,
            EBxMethod.GET,
            data,
        );
    }
}
