import { EBxMethod } from 'src/modules/bitrix/core';
import {
    CrmGetRequestType,
    CrmAddRequestType,
    CrmUpdateRequestType,
    CrmListRequestType,
} from '../../type/crm-request.type';
import { IBXLead } from '../interface/bx-lead.interface';
import { IBXField } from '../../fields/bx-field.interface';

export type LeadSchema = {
    [EBxMethod.GET]: {
        request: CrmGetRequestType;
        response: IBXLead;
    };
    [EBxMethod.LIST]: {
        request: CrmListRequestType<IBXLead>;
        response: IBXLead[];
    };
    [EBxMethod.ADD]: {
        request: CrmAddRequestType<IBXLead>;
        response: number;
    };
    [EBxMethod.UPDATE]: {
        request: CrmUpdateRequestType<IBXLead>;
        response: number;
    };
    [EBxMethod.DELETE]: {
        request: { id: number | string };
        response: boolean;
    };
    [EBxMethod.USER_FIELD_LIST]: {
        request: { filter: { [key: string]: any }; select?: string[] };
        response: IBXField[];
    };
    [EBxMethod.USER_FIELD_GET]: {
        request: { id: number | string; select?: string[] };
        response: IBXField;
    };
    [EBxMethod.USER_FIELD_ADD]: {
        request: { fields: Partial<IBXField> };
        response: IBXField;
    };
    [EBxMethod.USER_FIELD_UPDATE]: {
        request: { id: number | string; fields: Partial<IBXField> };
        response: boolean;
    };
    [EBxMethod.USER_FIELD_DELETE]: {
        request: { id: number | string };
        response: boolean;
    };
};
