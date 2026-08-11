import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImNotifySystemAdd,
    IBXImNotifySystemAddResult,
} from '../interface/bx-im-notify.interface';

export type BxImNotifySchema = {
    [EBxMethod.ADD]: {
        request: IBXImNotifySystemAdd;
        response: IBXImNotifySystemAddResult;
    };
};
