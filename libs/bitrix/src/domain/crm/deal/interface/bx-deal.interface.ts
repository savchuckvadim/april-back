export interface IBXDeal {
    [key: string]: string | number | string[] | number[] | boolean | undefined;
    ID: number;
    TITLE: string;
    CONTACT_IDS?: string[] | number[];
    CATEGORY_ID: string;
    STAGE_ID: string;
    COMPANY_ID: string;
    COMMENTS: string;
    ASSIGNED_BY_ID: string;
    CREATED_BY_ID: string;
    UF_CRM_OP_MHISTORY?: string[];
    UF_CRM_OP_CURRENT_STATUS?: string;
    UF_CRM_UC_ID?: string[]; //id комплекта арм Garant
    UF_CRM_RPA_ARM_COMPLECT_ID?: string[]; //id комплекта арм RPA April
    CLOSED: 'Y' | 'N';
    OPENED: 'Y' | 'N';
    MOVED_TIME: string;
    LAST_ACTIVITY_TIME: string;
    STAGE_SEMANTIC_ID: 'P' | 'S' | 'F';
}

/**
 * Привязка ОДНОГО контакта к сделке (`crm.deal.contact.add`): остальные
 * контакты сделки метод не трогает, уже привязанный не дублирует (ответ
 * false без ошибки).
 */
export interface IBXDealContactBinding {
    CONTACT_ID: number | string;
    SORT?: number;
    /** Не передан и у сделки нет первичного — станет первичным. */
    IS_PRIMARY?: 'Y' | 'N';
}
