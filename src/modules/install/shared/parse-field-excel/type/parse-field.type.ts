// import { EUserFieldType } from '@/modules/bitrix';
import { PbxSalesEventFieldType } from '@/modules/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { PbxSalesKonstructorFieldType } from '@/modules/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
// import { PbxSalesEventFieldType } from '@/modules/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
// import { PbxSalesKonstructorFieldType } from '@/modules/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';

export interface ListItem {
    VALUE: string;
    DEL: string;
    XML_ID: string;
    CODE: string;
    SORT: number;
}

export interface Field {
    name: string;
    appType: string;
    type: PbxSalesEventFieldType | PbxSalesKonstructorFieldType; // тип из exel файла
    // type: EUserFieldType | 'multiple';
    list: ListItem[];
    code: string;
    bxFieldName: string;
    order: number;
    isNeedUpdate: boolean;
    isMultiple: boolean;
}
