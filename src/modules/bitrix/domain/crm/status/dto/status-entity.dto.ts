/**
 * DTO для запроса элементов справочника по символьному идентификатору
 * @example { entityId: 'DEAL_STAGE' }
 * @example { entityId: 'SOURCE' }
 */
export class StatusEntityItemsRequestDto {
    /**
     * Тип справочника (например, DEAL_STAGE, SOURCE)
     * Можно получить список типов используя метод crm.status.entity.types
     */
    entityId: string;
}

/**
 * Элемент справочника
 */
export interface IStatusEntityItem {
    ID: string;
    STATUS_ID: string;
    NAME: string;
    SORT: number;
    COLOR?: string;
    SEMANTIC_ID?: string;
    [key: string]: any;
}

/**
 * DTO для ответа с элементами справочника
 */
export interface StatusEntityItemsResponseDto {
    result: IStatusEntityItem[];
    time: {
        start: number;
        finish: number;
        duration: number;
        processing: number;
        date_start: string;
        date_finish: string;
    };
}

/**
 * Тип справочника
 */
export interface IStatusEntityType {
    id: string;
    name: string;
    title: string;
}

/**
 * DTO для ответа с типами справочников
 */
export interface StatusEntityTypesResponseDto {
    result: IStatusEntityType[];
    time: {
        start: number;
        finish: number;
        duration: number;
        processing: number;
        date_start: string;
        date_finish: string;
    };
}
