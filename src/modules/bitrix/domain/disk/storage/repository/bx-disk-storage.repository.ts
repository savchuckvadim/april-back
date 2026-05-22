import { BitrixBaseApi } from '@/modules/bitrix/core/base/bitrix-base-api';
import { EBXEntity, EBxMethod, EBxNamespace } from '@/modules/bitrix/core';
import {
    IBXDiskStorage,
    IBXDiskStorageAddFolderRequest,
    IBXDiskStorageGetChildrenRequest,
    IBXDiskStorageGetRequest,
    IBXDiskStorageUploadFileRequest,
} from '../interfaces/bx-disk-storage.interface';

export class BxDiskStorageRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async getlist(filter?: Partial<IBXDiskStorage>) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.STORAGE,
            EBxMethod.GET_LIST,
            { filter },
        );
    }

    async gettypes() {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.STORAGE,
            EBxMethod.GET_TYPES,
            {},
        );
    }

    async get(data: IBXDiskStorageGetRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.STORAGE,
            EBxMethod.GET,
            data,
        );
    }

    async uploadfile(data: IBXDiskStorageUploadFileRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.STORAGE,
            EBxMethod.UPLOAD_FILE,
            data,
        );
    }

    async addfolder(data: IBXDiskStorageAddFolderRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.STORAGE,
            EBxMethod.ADD_FOLDER,
            data,
        );
    }

    async getchildren(data: IBXDiskStorageGetChildrenRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.STORAGE,
            EBxMethod.GET_CHILDREN,
            data,
        );
    }
}
