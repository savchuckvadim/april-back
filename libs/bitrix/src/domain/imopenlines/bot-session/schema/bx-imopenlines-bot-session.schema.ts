import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImOpenlinesSessionFinishRequest,
    IBXImOpenlinesSessionTransferRequest,
    IBXImOpenlinesSessionOperatorRequest,
    IBXImOpenlinesSessionMessageSendRequest,
    IBXImOpenlinesSessionBoolResponse,
    IBXImOpenlinesSessionResultResponse,
} from '../interface/bx-imopenlines-bot-session.interface';

export type ImOpenlinesBotSessionSchema = {
    [EBxMethod.SESSION_FINISH]: {
        request: IBXImOpenlinesSessionFinishRequest;
        response: IBXImOpenlinesSessionBoolResponse;
    };
    [EBxMethod.SESSION_TRANSFER]: {
        request: IBXImOpenlinesSessionTransferRequest;
        response: IBXImOpenlinesSessionBoolResponse;
    };
    [EBxMethod.SESSION_OPERATOR]: {
        request: IBXImOpenlinesSessionOperatorRequest;
        response: IBXImOpenlinesSessionResultResponse;
    };
    [EBxMethod.SESSION_MESSAGE_SEND]: {
        request: IBXImOpenlinesSessionMessageSendRequest;
        response: IBXImOpenlinesSessionResultResponse;
    };
};
