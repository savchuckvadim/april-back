import { EBxMethod } from '../../../core/domain/consts/bitrix-api.enum';
import { IBXList } from '../interface/bx-list.interface';

export type ListGetRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE?:
        | string
        | 'sales_kpi'
        | 'sales_history'
        | 'presentation'
        | 'ork_history';
};

export type ListFieldsGetRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE:
        | string
        | 'sales_kpi'
        | 'sales_history'
        | 'presentation'
        | 'ork_history';
    FIELD_ID?: string;
};

export type ListAddRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE: string;
    FIELDS: Partial<IBXList>;
};

export type ListFieldAddRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE: string;
    FIELDS: Record<string, any>;
};

export type ListFieldUpdateRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE: string;
    FIELD_ID: string | number;
    FIELDS: Record<string, any>;
};

export type ListFieldDeleteRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE: string;
    FIELD_ID: string | number;
};

export type BxListSchema = {
    [EBxMethod.GET]: {
        request: ListGetRequestType;
        response: IBXList;
    };
    [EBxMethod.ADD]: {
        request: ListAddRequestType;
        response: number;
    };
    [EBxMethod.FIELD_GET]: {
        request: ListFieldsGetRequestType;
        response: Record<string, any>;
    };
    [EBxMethod.FIELD_ADD]: {
        request: ListFieldAddRequestType;
        response: boolean;
    };
    [EBxMethod.FIELD_UPDATE]: {
        request: ListFieldUpdateRequestType;
        response: boolean;
    };
    [EBxMethod.FIELD_DELETE]: {
        request: ListFieldDeleteRequestType;
        response: boolean;
    };
};
