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
    start?: -1 | number;
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


export type CrmItemRequestType<T, O extends BitrixOwnerTypeId | string> = {
    id?: number | string;
    entityTypeId: O;
    fields: Partial<T>;
}

export type CrmItemListRequestType<T extends BitrixOwnerTypeId | string> = {

    entityTypeId: T;
    filter?: Partial<T>;
    select?: string[];
}

export type CrmItemGetRequestType<T extends BitrixOwnerTypeId | string> = {
    id: number | string;
    entityTypeId: T;
    select?: string[];

}

export type CrmItemAddRequestType<T, O extends BitrixOwnerTypeId | string> = {
    entityTypeId: O;
    fields: Partial<T>;
}