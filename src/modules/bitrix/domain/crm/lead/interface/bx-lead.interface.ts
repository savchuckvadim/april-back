export interface IBXLead {
    [key: string]: string | number | string[] | number[] | boolean | undefined;
    ID: number;
    TITLE: string;
    NAME: string;
    LAST_NAME: string;
    SECOND_NAME: string;
    STATUS_ID: string;
    SOURCE_ID: string;
    COMPANY_TITLE: string;
    COMPANY_ID: string;
    CONTACT_ID: string;
    ASSIGNED_BY_ID: string;
    CREATED_BY_ID: string;
    COMMENTS: string;
    PHONE?: string[];
    EMAIL?: string[];
}
