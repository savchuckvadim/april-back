import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImBotCommandRegisterRequest,
    IBXImBotCommandRegisterResponse,
    IBXImBotCommandUnregisterRequest,
    IBXImBotCommandUnregisterResponse,
    IBXImBotCommandUpdateRequest,
    IBXImBotCommandUpdateResponse,
    IBXImBotCommandAnswerRequest,
    IBXImBotCommandAnswerResponse,
} from '../interface/bx-imbot-command.interface';

export type ImBotCommandSchema = {
    [EBxMethod.REGISTER]: {
        request: IBXImBotCommandRegisterRequest;
        response: IBXImBotCommandRegisterResponse;
    };
    [EBxMethod.UNREGISTER]: {
        request: IBXImBotCommandUnregisterRequest;
        response: IBXImBotCommandUnregisterResponse;
    };
    [EBxMethod.UPDATE]: {
        request: IBXImBotCommandUpdateRequest;
        response: IBXImBotCommandUpdateResponse;
    };
    [EBxMethod.ANSWER]: {
        request: IBXImBotCommandAnswerRequest;
        response: IBXImBotCommandAnswerResponse;
    };
};
