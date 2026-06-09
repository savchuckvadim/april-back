/**
 * Типизация «parsed»-данных отделов.
 * Данных очень мало и они фиксированы — задаём статической картой
 * вместо чтения из Excel (как у групп звонков).
 *
 * В отличие от групп звонков отдел в Bitrix не создаётся: `bitrixId`
 * (id существующего отдела) приходит из тела запроса.
 */

/** Отделы, доступные для установки через эндпоинт. */
export enum PbxDepartamentGroupEnum {
    sales = 'sales',
    service = 'service',
}

export interface PbxDepartamentDefinition {
    type: 'department';
    group: PbxDepartamentGroupEnum;
    name: string;
    title: string;
}

/** Фиксированные имена/заголовки отделов. */
export const PBX_DEPARTAMENTS: Readonly<
    Record<PbxDepartamentGroupEnum, PbxDepartamentDefinition>
> = Object.freeze({
    [PbxDepartamentGroupEnum.sales]: {
        type: 'department',
        group: PbxDepartamentGroupEnum.sales,
        name: 'Отдел продаж',
        title: 'Отдел продаж',
    },
    [PbxDepartamentGroupEnum.service]: {
        type: 'department',
        group: PbxDepartamentGroupEnum.service,
        name: 'Отдел сервиса',
        title: 'Отдел сервиса',
    },
});
