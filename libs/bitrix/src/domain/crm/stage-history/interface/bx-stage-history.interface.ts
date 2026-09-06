import { CrmFilterType } from '../../type/crm-request.type';

/**
 * Запись истории движения по стадиям (crm.stagehistory.list).
 *
 * Состав полей — строго по официальной документации метода:
 * https://apidocs.bitrix24.ru/api-reference/crm/crm-stage-history-list.html
 */
export interface IBXStageHistoryItem {
    /** Идентификатор записи истории. */
    ID: number;
    /**
     * Тип объекта: 1 — лид, 2 — сделка, 5 — счёт (старый), 31 — счёт (новый),
     * числовой идентификатор пользовательского типа (смарт-процесса).
     */
    TYPE_ID: number;
    /** Идентификатор элемента (лида, сделки, счёта, элемента смарт-процесса). */
    OWNER_ID: number;
    /** Дата и время перехода на стадию (ISO 8601, с таймзоной портала). */
    CREATED_TIME: string;
    /** Идентификатор воронки (направления). */
    CATEGORY_ID: number;
    /** Семантика стадии: P — в работе, S — успех, F — провал. */
    STAGE_SEMANTIC_ID: 'P' | 'S' | 'F';
    /** Идентификатор стадии на момент записи. */
    STAGE_ID: string;
}

/**
 * entityTypeId запроса: 1 — лид, 2 — сделка, 5 — счёт (старый),
 * 31 — счёт (новый), числовой id смарт-процесса (в PortalModel — строкой).
 */
export type BxStageHistoryEntityTypeId = number | string;

/** Фильтр: точные значения, массивы и модификаторы ('>ID', '>=CREATED_TIME'). */
export type BxStageHistoryFilter = CrmFilterType<IBXStageHistoryItem>;

/** Сортировка: поле -> ASC | DESC (другие направления метод отвергает). */
export type BxStageHistoryOrder = {
    [K in keyof IBXStageHistoryItem]?: 'ASC' | 'DESC';
};

/** Параметры crm.stagehistory.list (только поля REST-метода). */
export interface IBXStageHistoryListRequest {
    entityTypeId: BxStageHistoryEntityTypeId;
    filter?: BxStageHistoryFilter;
    order?: BxStageHistoryOrder;
    select?: (keyof IBXStageHistoryItem)[];
    /**
     * Смещение страницы: значение next из предыдущего ответа
     * (документация «Особенности списочных методов»); -1 — без подсчёта total
     * для быстрой курсорной выборки (как в BxItemRepository.listAll).
     */
    start?: number;
}

/** Ответ crm.stagehistory.list: result.items; total/next — в обёртке IBitrixResponse. */
export interface IBXStageHistoryListResponse {
    items: IBXStageHistoryItem[];
}
