import { DuplicateEntityType } from './duplicate.type';

/** Сотрудник портала в том виде, в каком его показывает карточка дубля. */
export interface ResponsibleUser {
    id: number;
    /** «Иванов Иван» — то, что менеджер читает глазами. */
    name: string;
    position?: string;
    /** Руководитель — кому уходит запрос «хочу работать с этой компанией». */
    head?: {
        id: number;
        name: string;
    };
}

/**
 * Стадия сделки в терминах портала, а не Битрикса.
 *
 * `bitrixId` — сырой `C1:NEW`, но фронт рисует по `code`/`color`, которые
 * приходят из PortalModel. Благодаря этому палитра стадий живёт в настройках
 * портала, а не в вёрстке.
 */
export interface RelatedStage {
    bitrixId: string;
    code?: string;
    title?: string;
    color?: string;
    categoryCode?: string;
    categoryTitle?: string;
    /** Позиция стадии в воронке — для «полоски прогресса». */
    order?: number;
    /** Сколько всего стадий в воронке — знаменатель для той же полоски. */
    total?: number;
}

export interface RelatedDeal {
    id: number;
    title: string;
    stage: RelatedStage;
    responsible?: ResponsibleUser;
    opportunity?: number;
    /** Закрыта ли сделка (`CLOSED = Y`). */
    closed: boolean;
    dateCreate?: string;
}

export interface RelatedLead {
    id: number;
    title: string;
    statusId?: string;
    /** `P` — в работе, `S` — успех, `F` — провал. */
    statusSemanticId?: string;
    responsible?: ResponsibleUser;
    dateCreate?: string;
}

/** Что мы знаем о найденном контрагенте помимо самого факта совпадения. */
export interface RelatedEntitiesResult {
    entityType: DuplicateEntityType;
    entityId: number;
    responsible?: ResponsibleUser;
    deals: RelatedDeal[];
    leads: RelatedLead[];
    /** Сколько HTTP-запросов ушло на портал. */
    batchRequests: number;
    warnings: string[];
}

export interface RelatedEntitiesOptions {
    /**
     * Включать закрытые сделки. Стадия `APOLOGY` («извинения») исключается
     * всегда: это техническая стадия, показывать её менеджеру бессмысленно.
     */
    includeClosed?: boolean;
}

/** Технические стадии, которые не показываем никогда. */
export const HIDDEN_STAGE_BITRIX_IDS = ['APOLOGY'];
