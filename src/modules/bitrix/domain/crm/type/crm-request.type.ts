import { BitrixOwnerTypeId } from "src/modules/bitrix";

export type CrmAddRequestType<T> = {
    fields: Partial<T>;
    // ownerId?: number | string;
    // ownerType?: string;
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

export type CrmUpdateItemRequestType<T> = {
    id: number | string;
    entityTypeId: BitrixOwnerTypeId;
    fields: Partial<T>;
}
