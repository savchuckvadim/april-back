import { BxListFieldType } from '@/modules/bitrix';

export interface BxListFieldTypeMapping {
    TYPE: BxListFieldType;
    MULTIPLE: 'Y' | 'N';
}

/**
 * Маппинг типа поля из Excel-шаблона на тип свойства универсального списка Bitrix.
 *
 * Особый случай `multiple`: в Bitrix это строковое свойство с MULTIPLE=Y
 * (других множественных типов в шаблонах списков не бывает).
 */
export function mapParseTypeToListFieldType(
    parseType: string,
): BxListFieldTypeMapping {
    switch (parseType) {
        case 'multiple':
            return { TYPE: 'S', MULTIPLE: 'Y' };
        case 'integer':
        case 'double':
            return { TYPE: 'N', MULTIPLE: 'N' };
        case 'date':
            return { TYPE: 'S:Date', MULTIPLE: 'N' };
        case 'datetime':
            return { TYPE: 'S:DateTime', MULTIPLE: 'N' };
        case 'enumeration':
            return { TYPE: 'L', MULTIPLE: 'N' };
        case 'employee':
            return { TYPE: 'S:employee', MULTIPLE: 'N' };
        case 'crm':
            return { TYPE: 'S:ECrm', MULTIPLE: 'N' };
        case 'money':
            return { TYPE: 'S:Money', MULTIPLE: 'N' };
        case 'string':
        default:
            return { TYPE: 'S', MULTIPLE: 'N' };
    }
}
