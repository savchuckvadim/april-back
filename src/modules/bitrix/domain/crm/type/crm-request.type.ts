export type CrmAddRequestType<T> = {
    fields: Partial<T>;
}

export type CrmGetRequestType = {
    ID: number | string;
    select?: string[];
}

export type CrmListRequestType<T> = {
    filter: Partial<T>;
    select?: string[];
    order?: {
        [key in keyof T]?: 'asc' | 'desc' | 'ASC' | 'DESC'
    
    }

}
export type CrmUpdateRequestType<T> = {
    id: number | string;
    fields: Partial<T>;
}

