export interface IBXDiskFile {
    ID?: string;
    NAME?: string;
    CODE?: string | null;
    STORAGE_ID?: string;
    TYPE?: string;
    PARENT_ID?: string;
    DELETED_TYPE?: string | number;
    GLOBAL_CONTENT_VERSION?: string | number;
    FILE_ID?: string | number;
    SIZE?: string | number;
    CREATE_TIME?: string;
    UPDATE_TIME?: string;
    DELETE_TIME?: string | null;
    CREATED_BY?: string | number;
    UPDATED_BY?: string | number;
    DELETED_BY?: string | number | null;
    DOWNLOAD_URL?: string;
    DETAIL_URL?: string;
    [key: string]: unknown;
}

export interface IBXDiskFileVersion {
    ID?: string;
    OBJECT_ID?: string;
    SIZE?: string | number;
    NAME?: string;
    GLOBAL_CONTENT_VERSION?: string | number;
    CREATE_TIME?: string;
    CREATED_BY?: string | number;
    DOWNLOAD_URL?: string;
    [key: string]: unknown;
}

export interface IBXDiskFileFieldInfo {
    TYPE?: string;
    USE_IN_FILTER?: boolean;
    USE_IN_SHOW?: boolean;
    [key: string]: unknown;
}

export interface IBXDiskFileDeleteRequest {
    id: number;
}

export interface IBXDiskFileMoveToRequest {
    id: number;
    targetFolderId: number;
}

export interface IBXDiskFileRestoreRequest {
    id: number;
}

export interface IBXDiskFileGetRequest {
    id: number | string;
}

export interface IBXDiskFileGetVersionsRequest {
    id: number;
    filter?: Record<string, unknown>;
}

export interface IBXDiskFileMarkDeletedRequest {
    id: number;
}

export interface IBXDiskFileCopyToRequest {
    id: number;
    targetFolderId: number;
}

export interface IBXDiskFileGetExternalLinkRequest {
    id: number;
}

export interface IBXDiskFileRenameRequest {
    id: number;
    newName: string;
}

export interface IBXDiskFileUploadVersionRequest {
    id: number;
    fileContent: [string, string];
}

export interface IBXDiskFileRestoreFromVersionRequest {
    id: number;
    versionId: number;
}
