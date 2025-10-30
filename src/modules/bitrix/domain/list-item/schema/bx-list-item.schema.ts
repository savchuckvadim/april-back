import { EBxMethod } from '../../../core/domain/consts/bitrix-api.enum';
import { IBXList } from '../../interfaces/bitrix.interface';

export type BxListItemGetRequestType = {
    IBLOCK_TYPE_ID: 'lists';
    IBLOCK_CODE?:
    | string
    | 'sales_kpi'
    | 'sales_history'
    | 'presentation'
    | 'ork_history';
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
