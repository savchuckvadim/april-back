import { EBxMethod } from 'src/modules/bitrix/core';
import { CrmListRequestType } from '../crm/type/crm-request.type';
import {
    BXActivityRequestFields,
    IBXActivity,
} from './interfaces/bx-activity.interface';
import { IBXTask } from '../tasks/task';

export type ActivitySchema = {
    [EBxMethod.GET]: {
        request: { id: number | string };
        response: IBXTask;
    };
    [EBxMethod.LIST]: {
        request: CrmListRequestType<BXActivityRequestFields>;
        response: IBXActivity[];
    };
    [EBxMethod.ADD]: {
        request: {
            fields: Partial<IBXActivity>;
        };
        response: number;
    };
    [EBxMethod.UPDATE]: {
        request: {
            id: number | string;
            fields: Partial<IBXActivity>;
        };
        response: { tasks: IBXActivity[] };
    };
    [EBxMethod.DELETE]: {
        request: { id: number | string };
        response: { tasks: IBXActivity[] };
    };
};
