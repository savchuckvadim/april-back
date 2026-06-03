import { EBxMethod } from '@/modules/bitrix/core';
import {
    IBXDiskFolderAddSubfolderRequest,
    IBXDiskFolderDeleteTreeRequest,
    IBXDiskFolderFieldsInfo,
    IBXDiskFolderGetChildrenRequest,
    IBXDiskFolderGetExternalLinkRequest,
    IBXDiskFolderGetRequest,
    IBXDiskFolderItem,
    IBXDiskFolderMarkDeletedRequest,
    IBXDiskFolderMoveToRequest,
    IBXDiskFolderRenameRequest,
    IBXDiskFolderRestoreRequest,
    IBXDiskFolderShareToUserRequest,
    IBXDiskFolderUploadFileRequest,
} from '../interfaces/bx-disk-folder.interface';

export type BxDiskFolderSchema = {
    [EBxMethod.GET]: {
        request: IBXDiskFolderGetRequest;
        response: IBXDiskFolderItem;
    };
    [EBxMethod.GET_CHILDREN]: {
        request: IBXDiskFolderGetChildrenRequest;
        response: IBXDiskFolderItem[];
    };
    [EBxMethod.GET_FIELDS]: {
        request: Record<string, never>;
        response: Record<string, IBXDiskFolderFieldsInfo>;
    };
    [EBxMethod.RENAME]: {
        request: IBXDiskFolderRenameRequest;
        response: IBXDiskFolderItem;
    };
    [EBxMethod.MOVE_TO]: {
        request: IBXDiskFolderMoveToRequest;
        response: IBXDiskFolderItem | false;
    };
    [EBxMethod.COPY_TO]: {
        request: IBXDiskFolderMoveToRequest;
        response: IBXDiskFolderItem | false;
    };
    [EBxMethod.MARK_DELETED]: {
        request: IBXDiskFolderMarkDeletedRequest;
        response: IBXDiskFolderItem;
    };
    [EBxMethod.RESTORE]: {
        request: IBXDiskFolderRestoreRequest;
        response: IBXDiskFolderItem;
    };
    [EBxMethod.DELETE_TREE]: {
        request: IBXDiskFolderDeleteTreeRequest;
        response: boolean;
    };
    [EBxMethod.ADD_SUBFOLDER]: {
        request: IBXDiskFolderAddSubfolderRequest;
        response: IBXDiskFolderItem;
    };
    [EBxMethod.SHARE_TO_USER]: {
        request: IBXDiskFolderShareToUserRequest;
        response: boolean;
    };
    [EBxMethod.UPLOAD_FILE]: {
        request: IBXDiskFolderUploadFileRequest;
        response: IBXDiskFolderItem;
    };
    [EBxMethod.GET_EXTERNAL_LINK_LOWER]: {
        request: IBXDiskFolderGetExternalLinkRequest;
        response: string;
    };
};
