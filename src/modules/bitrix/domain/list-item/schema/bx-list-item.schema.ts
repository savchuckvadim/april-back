import { EBxMethod } from '../../../core/domain/consts/bitrix-api.enum';

export type BxListItemGetRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE?: string;
    IBLOCK_ID?: string;
    filter?: Record<string, any>;
    select?: string[];
    order?: Record<string, any>;
};

export type BxListItemSchema = {
    [EBxMethod.GET]: {
        request: BxListItemGetRequestType;
        response: Record<string, any>[];
    };
};
