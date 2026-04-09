import { EBxMethod } from '@/modules/bitrix/core';
import {
    IBXDiskFile,
    IBXDiskFileCopyToRequest,
    IBXDiskFileDeleteRequest,
    IBXDiskFileFieldInfo,
    IBXDiskFileGetExternalLinkRequest,
    IBXDiskFileGetRequest,
    IBXDiskFileGetVersionsRequest,
    IBXDiskFileMarkDeletedRequest,
    IBXDiskFileMoveToRequest,
    IBXDiskFileRenameRequest,
    IBXDiskFileRestoreFromVersionRequest,
    IBXDiskFileRestoreRequest,
    IBXDiskFileUploadVersionRequest,
    IBXDiskFileVersion,
} from '../interfaces/bx-disk-file.interface';

export type BxDiskFileSchema = {
    [EBxMethod.DELETE]: {
        request: IBXDiskFileDeleteRequest;
        response: boolean;
    };
    [EBxMethod.MOVE_TO]: {
        request: IBXDiskFileMoveToRequest;
        response: IBXDiskFile;
    };
    [EBxMethod.GET]: {
        request: IBXDiskFileGetRequest;
        response: IBXDiskFile;
    };
    [EBxMethod.RESTORE]: {
        request: IBXDiskFileRestoreRequest;
        response: IBXDiskFile;
    };
    [EBxMethod.GET_FIELDS]: {
        request: Record<string, never>;
        response: Record<string, IBXDiskFileFieldInfo>;
    };
    [EBxMethod.GET_VERSIONS]: {
        request: IBXDiskFileGetVersionsRequest;
        response: IBXDiskFileVersion[];
    };
    [EBxMethod.MARK_DELETED]: {
        request: IBXDiskFileMarkDeletedRequest;
        response: IBXDiskFile;
    };
    [EBxMethod.COPY_TO]: {
        request: IBXDiskFileCopyToRequest;
        response: IBXDiskFile;
    };
    [EBxMethod.GET_EXTERNAL_LINK]: {
        request: IBXDiskFileGetExternalLinkRequest;
        response: string;
    };
    [EBxMethod.RENAME]: {
        request: IBXDiskFileRenameRequest;
        response: IBXDiskFile;
    };
    [EBxMethod.UPLOAD_VERSION]: {
        request: IBXDiskFileUploadVersionRequest;
        response: IBXDiskFile;
    };
    [EBxMethod.RESTORE_FROM_VERSION]: {
        request: IBXDiskFileRestoreFromVersionRequest;
        response: IBXDiskFile;
    };
};
