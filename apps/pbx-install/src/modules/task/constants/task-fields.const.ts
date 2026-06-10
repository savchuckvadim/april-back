import { Field } from '../../shared/parse-field-excel/type/parse-field.type';

/**
 * Пользовательские поля ЗАДАЧИ для установки в Bitrix.
 *
 * Источник — константы (без Excel). `bxFieldName` указывается без префикса:
 * итоговое имя поля в Bitrix = `UF_TASK_` + `bxFieldName`.
 * Так, `EVENT_COMMENT` → `UF_TASK_EVENT_COMMENT`.
 *
 * У задач поддерживаются только скалярные типы (string/double/datetime/boolean),
 * enumeration недоступен.
 */
export const TASK_FIELDS: Field[] = [
    {
        name: 'Комментарий события',
        appType: 'task',
        type: 'string',
        list: [],
        code: 'event_comment',
        bxFieldName: 'EVENT_COMMENT',
        order: 100,
        isNeedUpdate: true,
        isMultiple: false,
    },
];
