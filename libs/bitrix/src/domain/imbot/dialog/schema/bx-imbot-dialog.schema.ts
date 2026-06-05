import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImBotDialogGetRequest,
    IBXImBotDialogGetResponse,
} from '../interface/bx-imbot-dialog.interface';

export type ImBotDialogSchema = {
    [EBxMethod.GET]: {
        request: IBXImBotDialogGetRequest;
        response: IBXImBotDialogGetResponse;
    };
};
