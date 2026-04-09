import { BitrixBaseApi } from '@/modules/bitrix/core/base/bitrix-base-api';
import { BxDiskFileRepository } from '../repository/bx-disk-file.repository';
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

export class BxDiskFileService {
    private repo: BxDiskFileRepository;

    clone(api: BitrixBaseApi): BxDiskFileService {
        const instance = new BxDiskFileService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxDiskFileRepository(api);
    }

    async delete(data: IBXDiskFileDeleteRequest) {
        return await this.repo.delete(data);
    }

    async moveto(data: IBXDiskFileMoveToRequest) {
        return await this.repo.moveto(data);
    }

    async restore(data: IBXDiskFileRestoreRequest) {
        return await this.repo.restore(data);
    }

    async get(data: IBXDiskFileGetRequest) {
        return await this.repo.get(data);
    }

    async getfields() {
        return await this.repo.getfields();
    }

    async getVersions(data: IBXDiskFileGetVersionsRequest) {
        return await this.repo.getVersions(data);
    }

    async markdeleted(data: IBXDiskFileMarkDeletedRequest) {
        return await this.repo.markdeleted(data);
    }

    async copyto(data: IBXDiskFileCopyToRequest) {
        return await this.repo.copyto(data);
    }

    async getExternalLink(data: IBXDiskFileGetExternalLinkRequest) {
        return await this.repo.getExternalLink(data);
    }

    async rename(data: IBXDiskFileRenameRequest) {
        return await this.repo.rename(data);
    }

    async uploadversion(data: IBXDiskFileUploadVersionRequest) {
        return await this.repo.uploadversion(data);
    }

    async restoreFromVersion(data: IBXDiskFileRestoreFromVersionRequest) {
        return await this.repo.restoreFromVersion(data);
    }
}
