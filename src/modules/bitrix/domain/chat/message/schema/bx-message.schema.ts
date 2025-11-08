import { EBxMethod } from 'src/modules/bitrix/core';
import { IBXMessageAddRequest, IBXMessageAddResponse } from '../interface/bx-message.interface';

export type MessageSchema = {
    [EBxMethod.ADD]: {
        request: IBXMessageAddRequest;
        response: IBXMessageAddResponse;
    };
};

