import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXImOpenlinesV2SessionListRequest } from '../interface/bx-imopenlines-v2-session.interface';

const NS = EBxNamespace.IMOPENLINES_V2;
const ENTITY = EBXEntity.SESSION_V2;

/** imopenlines.v2.Session.list — список сессий (диалогов) открытых линий. */
export class BxImOpenlinesV2SessionRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async list(data: IBXImOpenlinesV2SessionListRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.LIST, data);
    }

    listBtch(cmdCode: string, data: IBXImOpenlinesV2SessionListRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.LIST,
            data,
        );
    }
}
