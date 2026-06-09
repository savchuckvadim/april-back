/**
 * Типизация «parsed»-данных групп звонков.
 * Данных очень мало и они фиксированы — задаём статической картой
 * вместо чтения из Excel (как у полей/категорий).
 */

/** Группы звонков, доступные для установки через эндпоинт. */
export enum PbxCallingGroupEnum {
    sales = 'sales',
    service = 'service',
}

export interface PbxCallingGroupDefinition {
    type: 'calling';
    group: PbxCallingGroupEnum;
    name: string;
    title: string;
}

/** Фиксированные имена/заголовки групп звонков в Bitrix. */
export const PBX_CALLING_GROUPS: Readonly<
    Record<PbxCallingGroupEnum, PbxCallingGroupDefinition>
> = Object.freeze({
    [PbxCallingGroupEnum.sales]: {
        type: 'calling',
        group: PbxCallingGroupEnum.sales,
        name: 'ОП Звонки',
        title: 'ОП Звонки',
    },
    [PbxCallingGroupEnum.service]: {
        type: 'calling',
        group: PbxCallingGroupEnum.service,
        name: 'ОС Звонки',
        title: 'ОС Звонки',
    },
});
