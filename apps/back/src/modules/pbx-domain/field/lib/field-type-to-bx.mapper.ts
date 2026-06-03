import { EUserFieldType } from '@/modules/bitrix';
import { PbxSalesEventFieldType } from '../type/sales/event/pbx-sales-event-field.type';
import { PbxSalesKonstructorFieldType } from '../type/sales/konstructor/pbx-sales-konstructor-field.type';

type PortalFieldType = PbxSalesEventFieldType | PbxSalesKonstructorFieldType;
export const mapFieldTypeToBitrixType = (
    type: PortalFieldType,
): EUserFieldType => {
    const typeMap: Record<PortalFieldType, EUserFieldType> = {
        string: EUserFieldType.STRING,
        integer: EUserFieldType.INTEGER,
        // double: EUserFieldType.DOUBLE,
        datetime: EUserFieldType.DATETIME,
        date: EUserFieldType.DATE,
        boolean: EUserFieldType.BOOLEAN,
        enumeration: EUserFieldType.ENUMERATION,
        employee: EUserFieldType.EMPLOYEE,
        crm: EUserFieldType.CRM,
        multiple: EUserFieldType.STRING,
        money: EUserFieldType.MONEY,
    };
    return typeMap[type] ?? EUserFieldType.STRING;
};
