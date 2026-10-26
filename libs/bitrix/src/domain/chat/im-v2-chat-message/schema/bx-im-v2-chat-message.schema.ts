import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImV2ChatMessageTailRequest,
    IBXImV2ChatMessageTailResponse,
} from '../interface/bx-im-v2-chat-message.interface';

export type ImV2ChatMessageSchema = {
    [EBxMethod.TAIL]: {
        request: IBXImV2ChatMessageTailRequest;
        response: IBXImV2ChatMessageTailResponse;
    };
};
