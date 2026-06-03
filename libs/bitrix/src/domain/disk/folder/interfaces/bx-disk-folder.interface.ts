export interface IBXDiskAccessRule {
    TASK_ID: number;
    ACCESS_CODE: string;
}

export type IBXDiskAccessTaskName =
    | 'disk_access_read'
    | 'disk_access_add'
    | 'disk_access_edit'
    | 'disk_access_full';

export interface IBXDiskFolderItem {
    ID?: string;
    NAME?: string;
    CODE?: string | null;
    STORAGE_ID?: string;
    TYPE?: string;
    REAL_OBJECT_ID?: string;
    PARENT_ID?: string;
    DELETED_TYPE?: string | number;
    CREATE_TIME?: string;
    UPDATE_TIME?: string;
    DELETE_TIME?: string | null;
    CREATED_BY?: string | number;
    UPDATED_BY?: string | number;
    DELETED_BY?: string | number | null;
    DETAIL_URL?: string;
    DOWNLOAD_URL?: string;
    GLOBAL_CONTENT_VERSION?: string | number;
    FILE_ID?: string | number;
    SIZE?: string | number;
    [key: string]: unknown;
}

export interface IBXDiskFolderFieldsInfo {
    TYPE?: string;
    USE_IN_FILTER?: boolean;
    USE_IN_SHOW?: boolean;
    [key: string]: unknown;
}

export interface IBXDiskFolderGetRequest {
    id: number;
}

export interface IBXDiskFolderGetChildrenRequest {
    id?: number;
    filter?: Record<string, unknown>;
    order?: Record<string, 'ASC' | 'DESC'>;
    start?: number;
}

export interface IBXDiskFolderRenameRequest {
    id: number;
    newName: string;
}

export interface IBXDiskFolderMoveToRequest {
    id: number;
    targetFolderId: number;
}

export interface IBXDiskFolderMarkDeletedRequest {
    id: number;
}

export interface IBXDiskFolderRestoreRequest {
    id: number;
}

export interface IBXDiskFolderDeleteTreeRequest {
    id: number;
}

export interface IBXDiskFolderAddSubfolderRequest {
    id: number;
    data: {
        NAME: string;
    };
}

export interface IBXDiskFolderShareToUserRequest {
    id: number;
    userId: number;
    taskName: IBXDiskAccessTaskName;
}

export interface IBXDiskFolderUploadFileRequest {
    id: number;
    data: {
        NAME: string;
    };
    fileContent?: [string, string];
    rights?: IBXDiskAccessRule[];
    generateUniqueName?: boolean;
}

export interface IBXDiskFolderGetExternalLinkRequest {
    id: number;
}
