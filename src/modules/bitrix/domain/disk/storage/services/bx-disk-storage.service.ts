import { BitrixBaseApi } from '@/modules/bitrix/core/base/bitrix-base-api';
import { BxDiskStorageRepository } from '../repository/bx-disk-storage.repository';
import {
    IBXDiskStorageAddFolderRequest,
    IBXDiskStorageGetChildrenRequest,
    IBXDiskStorageGetRequest,
    IBXDiskStorageUploadFileRequest,
} from '../interfaces/bx-disk-storage.interface';

export class BxDiskStorageService {
    private repo: BxDiskStorageRepository;

    clone(api: BitrixBaseApi): BxDiskStorageService {
        const instance = new BxDiskStorageService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxDiskStorageRepository(api);
    }

    async getlist() {
        return await this.repo.getlist();
    }

    async gettypes() {
        return await this.repo.gettypes();
    }

    async get(data: IBXDiskStorageGetRequest) {
        return await this.repo.get(data);
    }

    async uploadfile(data: IBXDiskStorageUploadFileRequest) {
        return await this.repo.uploadfile(data);
    }

    async addfolder(data: IBXDiskStorageAddFolderRequest) {
        return await this.repo.addfolder(data);
    }

    async getchildren(data: IBXDiskStorageGetChildrenRequest) {
        return await this.repo.getchildren(data);
    }
}
