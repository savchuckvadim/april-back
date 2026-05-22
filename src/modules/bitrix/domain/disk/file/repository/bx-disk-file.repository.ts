import { BitrixBaseApi } from '@/modules/bitrix/core/base/bitrix-base-api';
import { EBXEntity, EBxMethod, EBxNamespace } from '@/modules/bitrix/core';
import {
    IBXDiskFileCopyToRequest,
    IBXDiskFileDeleteRequest,
    IBXDiskFileGetExternalLinkRequest,
    IBXDiskFileGetRequest,
    IBXDiskFileGetVersionsRequest,
    IBXDiskFileMarkDeletedRequest,
    IBXDiskFileMoveToRequest,
    IBXDiskFileRenameRequest,
    IBXDiskFileRestoreFromVersionRequest,
    IBXDiskFileRestoreRequest,
    IBXDiskFileUploadVersionRequest,
} from '../interfaces/bx-disk-file.interface';

export class BxDiskFileRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async delete(data: IBXDiskFileDeleteRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FILE,
            EBxMethod.DELETE,
            data,
        );
    }

    async moveto(data: IBXDiskFileMoveToRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FILE,
            EBxMethod.MOVE_TO,
            data,
        );
    }

    async restore(data: IBXDiskFileRestoreRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FILE,
            EBxMethod.RESTORE,
            data,
        );
    }

    async get(data: IBXDiskFileGetRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FILE,
            EBxMethod.GET,
            data,
        );
    }

    async getfields() {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FILE,
            EBxMethod.GET_FIELDS,
            {},
        );
    }

    async getVersions(data: IBXDiskFileGetVersionsRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FILE,
            EBxMethod.GET_VERSIONS,
            data,
        );
    }

    async markdeleted(data: IBXDiskFileMarkDeletedRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FILE,
            EBxMethod.MARK_DELETED,
            data,
        );
    }

    async copyto(data: IBXDiskFileCopyToRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FILE,
            EBxMethod.COPY_TO,
            data,
        );
    }

    async getExternalLink(data: IBXDiskFileGetExternalLinkRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FILE,
            EBxMethod.GET_EXTERNAL_LINK,
            data,
        );
    }

    async rename(data: IBXDiskFileRenameRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FILE,
            EBxMethod.RENAME,
            data,
        );
    }

    async uploadversion(data: IBXDiskFileUploadVersionRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FILE,
            EBxMethod.UPLOAD_VERSION,
            data,
        );
    }

    async restoreFromVersion(data: IBXDiskFileRestoreFromVersionRequest) {
        return await this.bxApi.callType(
            EBxNamespace.DISK,
            EBXEntity.FILE,
            EBxMethod.RESTORE_FROM_VERSION,
            data,
        );
    }
}
