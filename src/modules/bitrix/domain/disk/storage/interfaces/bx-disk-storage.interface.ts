import { IBXDiskAccessRule } from '../../folder';

export interface IBXDiskStorage {
    ID: string;
    NAME: string;
    CODE: string | null;
    MODULE_ID: string;
    ENTITY_TYPE: string;
    ENTITY_ID: string;
    ROOT_OBJECT_ID: string;
}

export type IBXDiskStorageType = string;

export interface IBXDiskStorageChildItem {
    ID: string;
    NAME: string;
    CODE: string | null;
    STORAGE_ID: string;
    TYPE: string;
    REAL_OBJECT_ID: string;
    PARENT_ID: string;
    DELETED_TYPE: string | number;
    DETAIL_URL?: string;
    [key: string]: unknown;
}

export interface IBXDiskStorageGetRequest {
    id: number | string;
}

export interface IBXDiskStorageGetChildrenRequest {
    id: number | string;
    filter?: Record<string, unknown>;
    order?: Record<string, 'ASC' | 'DESC'>;
    start?: number;
}

export interface IBXDiskStorageUploadFileRequest {
    id: number;
    data: {
        NAME: string;
    };
    fileContent: [string, string];
    rights?: IBXDiskAccessRule[];
    generateUniqueName?: boolean;
}

export interface IBXDiskStorageAddFolderRequest {
    id: number;
    data: {
        NAME: string;
    };
    rights: IBXDiskAccessRule[];
}
