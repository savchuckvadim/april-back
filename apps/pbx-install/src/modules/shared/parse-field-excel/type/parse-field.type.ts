// import { EUserFieldType } from '@/modules/bitrix';
import { PbxSalesEventFieldType } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { PbxSalesKonstructorFieldType } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
// import { PbxSalesEventFieldType } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
// import { PbxSalesKonstructorFieldType } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
export type FieldType = PbxSalesEventFieldType | PbxSalesKonstructorFieldType;
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
    type: FieldType; // тип из exel файла
    // type: EUserFieldType | 'multiple';
    list: ListItem[];
    code: string;
    bxFieldName: string;
    order: number;
    isNeedUpdate: boolean;
    isMultiple: boolean;
}
