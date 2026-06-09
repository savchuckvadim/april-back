/**
 * Интерфейсы метода `sonet_group.*` (рабочие группы и проекты Bitrix24).
 * Поля передаются в формате REST Bitrix (UPPERCASE).
 * Документация: https://apidocs.bitrix24.ru/api-reference/sonet-group/index.html
 */

/**
 * Поля создания рабочей группы (`sonet_group.create`).
 * Для проекта дополнительно задаются PROJECT + PROJECT_DATE_START/FINISH.
 */
export interface IBXSonetGroupFields {
    NAME: string;
    DESCRIPTION?: string;
    VISIBLE?: 'Y' | 'N';
    OPENED?: 'Y' | 'N';
    CLOSED?: 'Y' | 'N';
    SUBJECT_ID?: number | string;
    KEYWORDS?: string;
    INITIATE_PERMS?: string;
    SPAM_PERMS?: string;
    PROJECT?: 'Y' | 'N';
    PROJECT_DATE_START?: string;
    PROJECT_DATE_FINISH?: string;
    OWNER_ID?: number | string;
    SCRUM_MASTER_ID?: number | string;
    [key: string]: unknown;
}

export type IBXSonetGroupCreateFields = IBXSonetGroupFields;
export type IBXSonetGroupUpdateFields = Partial<IBXSonetGroupFields>;

/**
 * Фильтр для `sonet_group.get`.
 */
export interface ISonetGroupFilter {
    ID?: number | string;
    NAME?: string;
    OWNER_ID?: number | string;
    SUBJECT_ID?: number | string;
    [key: string]: unknown;
}

export interface ISonetGroupOrder {
    [field: string]: 'ASC' | 'DESC';
}

/**
 * Ответный объект рабочей группы (минимум нужных полей).
 */
export interface IBXSonetGroup {
    ID: string;
    NAME: string;
    DESCRIPTION: string;
    DATE_CREATE: string;
    DATE_UPDATE: string;
    ACTIVE: string;
    VISIBLE: string;
    OPENED: string;
    CLOSED: string;
    OWNER_ID: string;
    SUBJECT_ID: string;
    SUBJECT_NAME?: string;
    NUMBER_OF_MEMBERS?: string;
    PROJECT?: string;
    PROJECT_DATE_START?: string | null;
    PROJECT_DATE_FINISH?: string | null;
    [key: string]: unknown;
}
