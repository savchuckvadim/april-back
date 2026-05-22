import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXChatAddRequest,
    IBXChatAddResponse,
    IBXChatGetRequest,
    IBXChatGetResponse,
    IBXCountersGetResponse,
    IBXDialogGetRequest,
    IBXDialogGetResponse,
} from '../interface/bx-dialog.interface';

export type DialogSchema = {
    [EBxMethod.ADD]: {
        request: IBXChatAddRequest;
        response: IBXChatAddResponse;
    };
    [EBxMethod.GET]: {
        request: IBXChatGetRequest;
        response: IBXChatGetResponse;
    };
    [EBxMethod.COUNTERS_GET]: {
        request: {};
        response: IBXCountersGetResponse;
    };
    [EBxMethod.DIALOG_GET]: {
        request: IBXDialogGetRequest;
        response: IBXDialogGetResponse;
    };
};
