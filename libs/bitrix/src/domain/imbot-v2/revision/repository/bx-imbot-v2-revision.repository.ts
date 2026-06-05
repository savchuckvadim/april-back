import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXImBotV2RevisionGetRequest } from '../interface/bx-imbot-v2-revision.interface';

export class BxImBotV2RevisionRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async get(data: IBXImBotV2RevisionGetRequest = {}) {
        return await this.bxApi.callType(
            EBxNamespace.IMBOT_V2,
            EBXEntity.REVISION,
            EBxMethod.GET,
            data,
        );
    }

    getBtch(cmdCode: string, data: IBXImBotV2RevisionGetRequest = {}) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IMBOT_V2,
            EBXEntity.REVISION,
            EBxMethod.GET,
            data,
        );
    }
}
