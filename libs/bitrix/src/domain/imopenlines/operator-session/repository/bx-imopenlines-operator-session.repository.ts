import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXImOpenlinesSessionJoinRequest } from '../interface/bx-imopenlines-operator-session.interface';

const NS = EBxNamespace.IMOPENLINES;
const ENTITY = EBXEntity.SESSION;

/** imopenlines.session.* — действия пользователя ключа как оператора линии. */
export class BxImOpenlinesOperatorSessionRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async join(data: IBXImOpenlinesSessionJoinRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.JOIN, data);
    }

    joinBtch(cmdCode: string, data: IBXImOpenlinesSessionJoinRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.JOIN,
            data,
        );
    }
}
