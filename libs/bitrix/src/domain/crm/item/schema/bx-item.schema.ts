import { EBxMethod } from 'src/modules/bitrix/core';
import {
    CrmItemAddRequestType,
    CrmItemGetRequestType,
    CrmItemListRequestType,
    CrmUpdateItemRequestType,
} from '../../type/crm-request.type';

import { IBXItem } from '../interface/item.interface';

export type BxItemSchema = {
    [EBxMethod.UPDATE]: {
        request: CrmUpdateItemRequestType<IBXItem>;
        response: boolean;
    };

    [EBxMethod.LIST]: {
        request: CrmItemListRequestType<IBXItem['entityTypeId']>;
        response: { items: IBXItem[] };
    };

    [EBxMethod.GET]: {
        request: CrmItemGetRequestType<string | number>;
        response: { item: IBXItem };
    };

    [EBxMethod.ADD]: {
        request: CrmItemAddRequestType<IBXItem, string>;
        response: { item: IBXItem };
    };
    [EBxMethod.DELETE]: {
        request: CrmItemGetRequestType<string | number>;
        response: boolean;
    };

    /**
     * crm.item.fields: описание полей смарт-типа, ключи — ФАКТИЧЕСКИЕ
     * camel-имена crm.item (боевой инцидент UF_CRM_94_TRANSCRIPT_1:
     * формула ufCrm{typeId}{Pascal} совпадает с реальностью не всегда).
     */
    [EBxMethod.FIELDS]: {
        request: { entityTypeId: number | string };
        response: { fields: Record<string, Record<string, unknown>> };
    };
};
