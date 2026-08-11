import { BitrixBaseApi } from '@/modules/bitrix/core/base/bitrix-base-api';
import { DISK_GETCHILDREN_MAX_PAGES } from '../../disk.constants';
import { BxDiskFolderRepository } from '../repository/bx-disk-folder.repository';
import {
    IBXDiskFolderAddSubfolderRequest,
    IBXDiskFolderDeleteTreeRequest,
    IBXDiskFolderGetChildrenRequest,
    IBXDiskFolderItem,
    IBXDiskFolderGetExternalLinkRequest,
    IBXDiskFolderGetRequest,
    IBXDiskFolderMarkDeletedRequest,
    IBXDiskFolderMoveToRequest,
    IBXDiskFolderRenameRequest,
    IBXDiskFolderRestoreRequest,
    IBXDiskFolderShareToUserRequest,
    IBXDiskFolderUploadFileRequest,
} from '../interfaces/bx-disk-folder.interface';

export class BxDiskFolderService {
    private repo: BxDiskFolderRepository;

    clone(api: BitrixBaseApi): BxDiskFolderService {
        const instance = new BxDiskFolderService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxDiskFolderRepository(api);
    }

    async get(data: IBXDiskFolderGetRequest) {
        return await this.repo.get(data);
    }

    async getchildren(data: IBXDiskFolderGetChildrenRequest) {
        return await this.repo.getchildren(data);
    }

    /**
     * Все страницы `disk.folder.getchildren` (Bitrix отдаёт по 50):
     * крутит `start` по `next` из ответа, пока страницы не кончатся.
     */
    async getchildrenAll(
        data: Omit<IBXDiskFolderGetChildrenRequest, 'start'>,
    ): Promise<IBXDiskFolderItem[]> {
        const out: IBXDiskFolderItem[] = [];
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

    async getfields() {
        return await this.repo.getfields();
    }

    async rename(data: IBXDiskFolderRenameRequest) {
        return await this.repo.rename(data);
    }

    async moveto(data: IBXDiskFolderMoveToRequest) {
        return await this.repo.moveto(data);
    }

    async copyto(data: IBXDiskFolderMoveToRequest) {
        return await this.repo.copyto(data);
    }

    async markdeleted(data: IBXDiskFolderMarkDeletedRequest) {
        return await this.repo.markdeleted(data);
    }

    async restore(data: IBXDiskFolderRestoreRequest) {
        return await this.repo.restore(data);
    }

    async deletetree(data: IBXDiskFolderDeleteTreeRequest) {
        return await this.repo.deletetree(data);
    }

    async addsubfolder(data: IBXDiskFolderAddSubfolderRequest) {
        return await this.repo.addsubfolder(data);
    }

    async sharetouser(data: IBXDiskFolderShareToUserRequest) {
        return await this.repo.sharetouser(data);
    }

    async uploadfile(data: IBXDiskFolderUploadFileRequest) {
        return await this.repo.uploadfile(data);
    }

    async getexternallink(data: IBXDiskFolderGetExternalLinkRequest) {
        return await this.repo.getexternallink(data);
    }
}
