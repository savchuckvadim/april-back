import { EBxMethod } from 'src/modules/bitrix/core';
import {
    CrmGetRequestType,
    CrmAddRequestType,
    CrmUpdateRequestType,
    CrmListRequestType,
} from '../../type/crm-request.type';
import { IBXRequisite } from '../interface/bx-requisite.interface';
import { IBXField } from '../../fields/bx-field.interface';

export type RequisiteSchema = {
    [EBxMethod.GET]: {
        request: CrmGetRequestType;
        response: IBXRequisite;
    };
    [EBxMethod.LIST]: {
        request: CrmListRequestType<IBXRequisite>;
        response: IBXRequisite[];
    };
    [EBxMethod.ADD]: {
        request: CrmAddRequestType<IBXRequisite>;
        response: number;
    };
    [EBxMethod.UPDATE]: {
        request: CrmUpdateRequestType<IBXRequisite>;
        response: boolean;
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
