import { EBxMethod } from '@/modules/bitrix/core';
import {
    IBXDiskStorage,
    IBXDiskStorageAddFolderRequest,
    IBXDiskStorageChildItem,
    IBXDiskStorageGetChildrenRequest,
    IBXDiskStorageGetRequest,
    IBXDiskStorageType,
    IBXDiskStorageUploadFileRequest,
} from '../interfaces/bx-disk-storage.interface';

export type BxDiskStorageSchema = {
    [EBxMethod.GET_LIST]: {
        request: Record<string, never>;
        response: IBXDiskStorage[];
    };
    [EBxMethod.GET_TYPES]: {
        request: Record<string, never>;
        response: IBXDiskStorageType[];
    };
    [EBxMethod.GET]: {
        request: IBXDiskStorageGetRequest;
        response: IBXDiskStorage;
    };
    [EBxMethod.UPLOAD_FILE]: {
        request: IBXDiskStorageUploadFileRequest;
        response: IBXDiskStorageChildItem;
    };
    [EBxMethod.ADD_FOLDER]: {
        request: IBXDiskStorageAddFolderRequest;
        response: IBXDiskStorageChildItem;
    };
    [EBxMethod.GET_CHILDREN]: {
        request: IBXDiskStorageGetChildrenRequest;
        response: IBXDiskStorageChildItem[];
    };
};
