import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImOpenlinesSessionJoinRequest,
    IBXImOpenlinesSessionJoinResponse,
} from '../interface/bx-imopenlines-operator-session.interface';

export type ImOpenlinesOperatorSessionSchema = {
    [EBxMethod.JOIN]: {
        request: IBXImOpenlinesSessionJoinRequest;
        response: IBXImOpenlinesSessionJoinResponse;
    };
};
