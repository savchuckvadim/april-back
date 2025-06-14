import { EBxMethod } from "../../../core/domain/consts/bitrix-api.enum";
import { IBXList } from "../../interfaces/bitrix.interface";


export type ListGetRequestType = {
    'IBLOCK_TYPE_ID': 'lists',
    'IBLOCK_CODE'?: string | 'sales_kpi' | 'sales_history' | 'presentation' | 'ork_history'

}

export type ListFieldsGetRequestType = {
    'IBLOCK_TYPE_ID': 'lists',
    'IBLOCK_CODE': string | 'sales_kpi' | 'sales_history' | 'presentation' | 'ork_history'
    FIELD_ID?: string
}

export type BxListSchema = {

    [EBxMethod.GET]: {
        request: ListGetRequestType;
        response: IBXList;
    };

    [EBxMethod.FIELD_GET]: {
        request: ListFieldsGetRequestType;
        response: null // IBXField;
    };

};
