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

/**
 * Множественность поля для Битрикса (`MULTIPLE='Y'`).
 *
 * Шаблонный тип `multiple` ПО ОПРЕДЕЛЕНИЮ означает строковое поле со
 * множественными значениями — отдельный флаг для него не нужен и является
 * лишь дублем. Пока флаг существует в шаблонах, он остаётся вторым путём
 * («любой другой тип, помеченный множественным»), но тип главнее.
 *
 * Почему это важно: рассинхрон типа и флага не даёт ошибки — поле просто
 * создаётся одиночным, а запись массива Битрикс молча превращает в строку
 * «Array» (так терялась история обработки заявки).
 */
export const isBitrixMultipleField = (field: {
    type: PortalFieldType;
    isMultiple?: boolean;
}): boolean => field.type === 'multiple' || field.isMultiple === true;
