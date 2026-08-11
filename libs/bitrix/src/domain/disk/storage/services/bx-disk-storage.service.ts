import { BitrixBaseApi } from '@/modules/bitrix/core/base/bitrix-base-api';
import { DISK_GETCHILDREN_MAX_PAGES } from '../../disk.constants';
import { BxDiskStorageRepository } from '../repository/bx-disk-storage.repository';
import {
    IBXDiskStorage,
    IBXDiskStorageAddFolderRequest,
    IBXDiskStorageChildItem,
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

    async getlist(filter?: Partial<IBXDiskStorage>) {
        return await this.repo.getlist(filter);
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

    /**
     * Все страницы `disk.storage.getchildren` (Bitrix отдаёт по 50):
     * крутит `start` по `next` из ответа, пока страницы не кончатся.
     */
    async getchildrenAll(
        data: Omit<IBXDiskStorageGetChildrenRequest, 'start'>,
    ): Promise<IBXDiskStorageChildItem[]> {
        const out: IBXDiskStorageChildItem[] = [];
        let start = 0;
        for (let page = 0; page < DISK_GETCHILDREN_MAX_PAGES; page++) {
            const res = await this.repo.getchildren({ ...data, start });
            out.push(...(res.result ?? []));
            if (res.next === undefined || res.next === null) {
                break;
            }
            start = res.next;
        }
        return out;
    }
}
