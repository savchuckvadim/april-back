import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXImBotV2EventGetRequest } from '../interface/bx-imbot-v2-event.interface';

export class BxImBotV2EventRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async get(data: IBXImBotV2EventGetRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT_V2,
            EBXEntity.EVENT,
            EBxMethod.GET,
            data,
        );
    }

    getBtch(cmdCode: string, data: IBXImBotV2EventGetRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IMBOT_V2,
            EBXEntity.EVENT,
            EBxMethod.GET,
            data,
        );
    }
}
