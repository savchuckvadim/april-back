import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXDialogMessagesGetRequest,
    IBXDialogMessagesGetResponse,
} from '../interface/bx-dialog-message.interface';

export type DialogMessageSchema = {
    [EBxMethod.GET]: {
        request: IBXDialogMessagesGetRequest;
        response: IBXDialogMessagesGetResponse;
    };
};
