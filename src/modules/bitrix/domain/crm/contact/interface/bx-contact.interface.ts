export interface IBXContact {
    ID?: number | string;
    ASSIGNED_BY_ID?: string | number;
    COMPANY_ID?: string | number;
    NAME?: string;
    LAST_NAME?: string;
    SECOND_NAME?: string;
    PHONE?: {
        VALUE: string,
        TYPE: string
    }[]
    EMAIL?: {
        VALUE: string,
        TYPE: string
    }[]
    POST?: string
    COMMENTS?: string

    TYPE_ID?: string;
    SOURCE_ID?: string;
    SOURCE_DESCRIPTION?: string;
    BIRTHDATE?: string;
 
    ADDRESS?: string;
    ADDRESS_2?: string;
    ADDRESS_CITY?: string;
    ADDRESS_POSTAL_CODE?: string;
    ADDRESS_REGION?: string;
    ADDRESS_PROVINCE?: string;
    ADDRESS_COUNTRY?: string;
    UTM_SOURCE?: string;
    UTM_MEDIUM?: string;
    UTM_CAMPAIGN?: string;
    UTM_CONTENT?: string;
    UTM_TERM?: string;
} 

// export interface IBXContact {
//     ASSIGNED_BY_ID?: string | number
//     ID?: number
//     NAME?: string
//     COMPANY_ID?: string | number
//     LAST_NAME?: string
//     // TYPE_ID: 'client'
//     // SOURCE_ID: number
//     // PHONE: string //wrong

// }