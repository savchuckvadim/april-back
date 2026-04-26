import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    IBXImV2EventGetRequest,
    IBXImV2EventSubscribeRequest,
} from '../interface/bx-im-v2-event.interface';

export class BxImV2EventRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async subscribe(data: IBXImV2EventSubscribeRequest = {}) {
        return await this.bxApi.callType(
            EBxNamespace.IMV2,
            EBXEntity.EVENT,
            EBxMethod.SUBSCRIBE,
            data,
        );
    }

    subscribeBtch(cmdCode: string, data: IBXImV2EventSubscribeRequest = {}) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IMV2,
            EBXEntity.EVENT,
            EBxMethod.SUBSCRIBE,
            data,
        );
    }

    async get(data: IBXImV2EventGetRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMV2,
            EBXEntity.EVENT,
            EBxMethod.GET,
            data,
        );
    }

    getBtch(cmdCode: string, data: IBXImV2EventGetRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IMV2,
            EBXEntity.EVENT,
            EBxMethod.GET,
            data,
        );
    }
}
