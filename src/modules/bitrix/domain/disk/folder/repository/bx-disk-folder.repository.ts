import { BitrixBaseApi } from '@/modules/bitrix/core/base/bitrix-base-api';
import { EBXEntity, EBxMethod, EBxNamespace } from '@/modules/bitrix/core';
import {
    IBXDiskFolderAddSubfolderRequest,
    IBXDiskFolderDeleteTreeRequest,
    IBXDiskFolderGetChildrenRequest,
    IBXDiskFolderGetExternalLinkRequest,
    IBXDiskFolderGetRequest,
    IBXDiskFolderMarkDeletedRequest,
    IBXDiskFolderMoveToRequest,
    IBXDiskFolderRenameRequest,
    IBXDiskFolderRestoreRequest,
    IBXDiskFolderShareToUserRequest,
    IBXDiskFolderUploadFileRequest,
} from '../interfaces/bx-disk-folder.interface';

export class BxDiskFolderRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async get(data: IBXDiskFolderGetRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FOLDER,
            EBxMethod.GET,
            data,
        );
    }

    async getchildren(data: IBXDiskFolderGetChildrenRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FOLDER,
            EBxMethod.GET_CHILDREN,
            data,
        );
    }

    async getfields() {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FOLDER,
            EBxMethod.GET_FIELDS,
            {},
        );
    }

    async rename(data: IBXDiskFolderRenameRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FOLDER,
            EBxMethod.RENAME,
            data,
        );
    }

    async moveto(data: IBXDiskFolderMoveToRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FOLDER,
            EBxMethod.MOVE_TO,
            data,
        );
    }

    async copyto(data: IBXDiskFolderMoveToRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FOLDER,
            EBxMethod.COPY_TO,
            data,
        );
    }

    async markdeleted(data: IBXDiskFolderMarkDeletedRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FOLDER,
            EBxMethod.MARK_DELETED,
            data,
        );
    }

    async restore(data: IBXDiskFolderRestoreRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FOLDER,
            EBxMethod.RESTORE,
            data,
        );
    }

    async deletetree(data: IBXDiskFolderDeleteTreeRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FOLDER,
            EBxMethod.DELETE_TREE,
            data,
        );
    }

    async addsubfolder(data: IBXDiskFolderAddSubfolderRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FOLDER,
            EBxMethod.ADD_SUBFOLDER,
            data,
        );
    }

    async sharetouser(data: IBXDiskFolderShareToUserRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FOLDER,
            EBxMethod.SHARE_TO_USER,
            data,
        );
    }

    async uploadfile(data: IBXDiskFolderUploadFileRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FOLDER,
            EBxMethod.UPLOAD_FILE,
            data,
        );
    }

    async getexternallink(data: IBXDiskFolderGetExternalLinkRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FOLDER,
            EBxMethod.GET_EXTERNAL_LINK_LOWER,
            data,
        );
    }
}
