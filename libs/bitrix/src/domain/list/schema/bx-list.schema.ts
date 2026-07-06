import { EBxMethod } from '../../../core/domain/consts/bitrix-api.enum';
import {
    BxListFieldsGetResponse,
    IBXList,
    IBXListFieldPayload,
} from '../interface/bx-list.interface';

export type ListGetRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE?: string;
    IBLOCK_ID?: string | number;
};

export type ListFieldsGetRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE?: string;
    IBLOCK_ID?: string | number;
    FIELD_ID?: string | number;
};

export type ListAddRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE: string;
    FIELDS: Partial<IBXList>;
};

export type ListUpdateRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE?: string;
    IBLOCK_ID?: string | number;
    FIELDS: Partial<IBXList>;
};

export type ListDeleteRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE?: string;
    IBLOCK_ID?: string | number;
};

export type ListFieldAddRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE?: string;
    IBLOCK_ID?: string | number;
    FIELDS: IBXListFieldPayload;
};

export type ListFieldUpdateRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE?: string;
    IBLOCK_ID?: string | number;
    FIELD_ID: string | number;
    FIELDS: IBXListFieldPayload;
};

export type ListFieldDeleteRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE?: string;
    IBLOCK_ID?: string | number;
    FIELD_ID: string | number;
};

export type BxListSchema = {
    [EBxMethod.GET]: {
        request: ListGetRequestType;
        response: IBXList[];
    };
    [EBxMethod.ADD]: {
        request: ListAddRequestType;
        response: number;
    };
    [EBxMethod.UPDATE]: {
        request: ListUpdateRequestType;
        response: boolean;
    };
    [EBxMethod.DELETE]: {
        request: ListDeleteRequestType;
        response: boolean;
    };
    [EBxMethod.FIELD_GET]: {
        request: ListFieldsGetRequestType;
        response: BxListFieldsGetResponse;
    };
    [EBxMethod.FIELD_ADD]: {
        request: ListFieldAddRequestType;
        response: string | number;
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
