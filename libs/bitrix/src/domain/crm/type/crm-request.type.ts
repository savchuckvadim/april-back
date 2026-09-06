import { BitrixOwnerTypeId } from 'src/modules/bitrix';

export type CrmAddRequestType<T> = {
    fields: Partial<T>;
    // ownerId?: number | string;
    // ownerType?: string;
};

export type CrmGetRequestType = {
    ID: number | string;
    select?: string[];
};

export type CrmListRequestType<T> = {
    filter: Partial<T>;
    select?: string[];
    start?: number;
    order?: {
        [key in keyof T]?: 'asc' | 'desc' | 'ASC' | 'DESC';
    };
};
export type CrmUpdateRequestType<T> = {
    id: number | string;
    fields: Partial<T>;
};

export type CrmUpdateItemRequestType<T> = {
    id: number | string;
    entityTypeId: BitrixOwnerTypeId;
    fields: Partial<T>;
};

export type CrmItemRequestType<T, O extends BitrixOwnerTypeId | string> = {
    id?: number | string;
    entityTypeId: O;
    fields: Partial<T>;
};

export type CrmItemListRequestType<T extends BitrixOwnerTypeId | string> = {
    entityTypeId: T;
    filter?: Partial<T>;
    select?: string[];
    order?: Record<string, 'ASC' | 'DESC'>;
    /** Смещение страницы; -1 отключает подсчёт total для быстрой постраничной выборки. */
    start?: number;
};

/**
 * Префиксы-модификаторы фильтра списочных методов CRM (полный список —
 * в комментарии bx-deal.repository.ts): сравнения, IN / NOT IN, LIKE, отрицание.
 */
export type CrmFilterModifier =
    | ''
    | '>='
    | '>'
    | '<='
    | '<'
    | '@'
    | '!@'
    | '%'
    | '=%'
    | '%='
    | '='
    | '!='
    | '!';

/**
 * Строго типизированный фильтр списочного метода: поле сущности с
 * необязательным префиксом-модификатором ('>ID', '>=CREATED_TIME', '@STAGE_ID'),
 * значение — скаляр поля или массив (для IN / NOT IN).
 */
export type CrmFilterType<T> = {
    [K in Extract<keyof T, string> as `${CrmFilterModifier}${K}`]?:
        | T[K]
        | T[K][];
};

export type CrmItemGetRequestType<T extends BitrixOwnerTypeId | string> = {
    id: number | string;
    entityTypeId: T;
    select?: string[];
};

export type CrmItemAddRequestType<T, O extends BitrixOwnerTypeId | string> = {
    entityTypeId: O;
    fields: Partial<T>;
};
