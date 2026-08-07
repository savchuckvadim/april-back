import { EBxMethod } from 'src/modules/bitrix/core';
import { CrmListRequestType } from '../../type/crm-request.type';
import {
    IBXRequisiteLink,
    IBXRequisiteLinkGetRequest,
    IBXRequisiteLinkRegisterFields,
} from '../interface/bx-requisite-link.interface';

export type RequisiteLinkSchema = {
    [EBxMethod.GET]: {
        request: IBXRequisiteLinkGetRequest;
        response: IBXRequisiteLink;
    };
    [EBxMethod.LIST]: {
        request: CrmListRequestType<IBXRequisiteLink>;
        response: IBXRequisiteLink[];
    };
    [EBxMethod.REGISTER]: {
        request: { fields: IBXRequisiteLinkRegisterFields };
        response: boolean;
    };
    [EBxMethod.UNREGISTER]: {
        request: IBXRequisiteLinkGetRequest;
        response: boolean;
    };
    [EBxMethod.FIELDS]: {
        request: Record<string, never>;
        response: Record<string, unknown>;
    };
};
