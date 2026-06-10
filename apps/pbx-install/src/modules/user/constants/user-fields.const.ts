import { Field } from '../../shared/parse-field-excel/type/parse-field.type';

/**
 * Пользовательские поля ПОЛЬЗОВАТЕЛЯ для установки в Bitrix.
 *
 * Источник — константы (без Excel). `bxFieldName` указывается без префикса:
 * итоговое имя поля в Bitrix = `UF_USR_` + `bxFieldName`.
 * Так, `EVENT_COMMENT` → `UF_USR_EVENT_COMMENT`.
 *
 * Стартовый набор-пример; дополняется по мере необходимости.
 */
export const USER_FIELDS: Field[] = [
    {
        name: 'Комментарий события',
        appType: 'user',
        type: 'string',
        list: [],
        code: 'event_comment',
        bxFieldName: 'EVENT_COMMENT',
        order: 100,
        isNeedUpdate: true,
        isMultiple: false,
    },
];
