import { EBxMethod } from 'src/modules/bitrix/core';
import { IBXStatus } from '../interface/bx-status.interface';
import { CrmListRequestType } from '../../type/crm-request.type';

export type BxStatusSchema = {
    [EBxMethod.LIST]: {
        request: CrmListRequestType<IBXStatus>;
        response: IBXStatus[];
    };
    [EBxMethod.GET]: {
        request: { id: number | string };
        response: IBXStatus;
    };
    [EBxMethod.ADD]: {
        request: { fields: Partial<IBXStatus> };
        response: number;
    };
    [EBxMethod.UPDATE]: {
        request: { id: number | string; fields: Partial<IBXStatus> };
        response: boolean;
    };
    [EBxMethod.DELETE]: {
        request: { id: number | string };
        response: boolean;
    };
};
