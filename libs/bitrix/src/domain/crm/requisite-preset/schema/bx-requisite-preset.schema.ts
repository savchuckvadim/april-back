import { EBxMethod } from 'src/modules/bitrix/core';
import {
    CrmAddRequestType,
    CrmUpdateRequestType,
    CrmListRequestType,
} from '../../type/crm-request.type';
import {
    IBXRequisitePreset,
    IBXRequisitePresetCountry,
} from '../interface/bx-requisite-preset.interface';

export type RequisitePresetSchema = {
    // crm.requisite.preset.get принимает id (строчными), а не ID
    [EBxMethod.GET]: {
        request: { id: number | string; select?: string[] };
        response: IBXRequisitePreset;
    };
    [EBxMethod.LIST]: {
        request: CrmListRequestType<IBXRequisitePreset>;
        response: IBXRequisitePreset[];
    };
    [EBxMethod.ADD]: {
        request: CrmAddRequestType<IBXRequisitePreset>;
        response: number;
    };
    [EBxMethod.UPDATE]: {
        request: CrmUpdateRequestType<IBXRequisitePreset>;
        response: boolean;
    };
    [EBxMethod.DELETE]: {
        request: { id: number | string };
        response: boolean;
    };
    [EBxMethod.COUNTRIES]: {
        request: Record<string, never>;
        response: IBXRequisitePresetCountry[];
    };
};
