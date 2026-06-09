import { mutateCustomFieldXmlIdByName } from '@/apps/rq/shared';
import { CustomField } from '@/apps/rq/types/bx-custom-field.type';

/**
 * Сырые данные пользовательского поля из ответа Bitrix24
 * (crm.requisite.userfield.get).
 */
export interface RawCustomFieldResult {
    ID?: number | string;
    FIELD_NAME?: string;
    XML_ID?: string | null;
    EDIT_FORM_LABEL?: string | { ru?: string } | null;
}

/**
 * Утилиты для работы с пользовательскими полями
 */

/**
 * Проверяет, является ли поле пользовательским (начинается с UF_)
 */
export const isCustomField = (key: string): boolean => {
    return key.startsWith('UF_');
};

/**
 * Создает команду для получения информации о пользовательском поле
 */
export const createCustomFieldInfoCommand = (fieldName: string): string => {
    return `field_name_${fieldName}`;
};

/**
 * Создает команду для получения значения пользовательского поля
 */
export const createCustomFieldValueCommand = (fieldName: string): string => {
    return `rq_${fieldName}`;
};

/**
 * Обрабатывает результат получения пользовательского поля
 */
export const processCustomFieldResult = (
    resultValue: RawCustomFieldResult,
    fieldValue: unknown,
): CustomField => {
    const label = resultValue.EDIT_FORM_LABEL;
    const editFormLabel =
        typeof label === 'object' && label !== null
            ? (label.ru ?? '')
            : (label ?? '');

    const customField: Partial<CustomField> = {
        ID: Number(resultValue.ID) || 0,
        FIELD_NAME: resultValue.FIELD_NAME ?? '',
        XML_ID: resultValue.XML_ID ?? null,
        EDIT_FORM_LABEL: editFormLabel,
        value: fieldValue as string | null,
    };

    mutateCustomFieldXmlIdByName(customField);

    return new CustomField(customField);
};

/**
 * Проверяет, существует ли customField в массиве
 */
export const customFieldExists = (
    customFields: CustomField[],
    customField: CustomField,
): boolean => {
    return customFields.some(cf => cf.ID === customField.ID);
};

/**
 * Добавляет customField в массив, если его там еще нет
 */
export const addCustomFieldIfNotExists = (
    customFields: CustomField[],
    customField: CustomField,
): void => {
    if (!customFieldExists(customFields, customField)) {
        customFields.push(customField);
    }
};
