export interface IBXStatus {
    ID?: string;
    ENTITY_ID: string;
    STATUS_ID?: string;
    SORT?: number | string;
    NAME?: string;
    NAME_INIT?: string;
    SYSTEM?: 'Y' | 'N';
    COLOR?: string;
    SEMANTICS?: string;
    CATEGORY_ID?: number | string;
    EXTRA?: Record<string, any>;
}
