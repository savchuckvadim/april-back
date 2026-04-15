import { delay } from '@/shared/lib';
import { BitrixService } from '@/modules/bitrix';
import {
    IBXDiskFolderItem,
    IBXDiskStorageChildItem,
} from '@/modules/bitrix/domain/disk';
import { PortalModel } from '@/modules/portal/services/portal.model';

export class BxDiskGetFilesFlowService {
    private rootStorageId: number | undefined;
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portalModel: PortalModel,
        private readonly companyId: number | string,
        private readonly dealId?: number | string,
    ) { }

    public async get(): Promise<{ files: [string, string][] }> {
        await this.getRootFolderId();
        if (!this.rootStorageId) {
            throw new Error('Root storage folder ID is not found');
        }
        const storagefolder = await this.getExistingFolder();
        if (!storagefolder) {
            throw new Error('Storage folder is not found');
        }
        const folderId = Number(storagefolder.ID);
        const filesFromFolder = await this.getFiles(folderId);

        const files: [string, string][] = [];
        for (const fileFromFolder of filesFromFolder) {
            const file =
                await this.bitrix.file.downloadBitrixFileAndConvertToBase64(
                    fileFromFolder.DOWNLOAD_URL || '',
                );
            files.push(file);
            await delay(700);
        }
        return { files };
    }

    private async getExistingFolder(): Promise<IBXDiskStorageChildItem | null> {
        const storagefoldersResponse =
            await this.bitrix.disk.storage.getchildren({
                id: this.rootStorageId?.toString() || '',
                filter: {
                    TYPE: 'folder',
                    NAME: this.getFolderName(),
                },
            });

        const storagefolder = storagefoldersResponse.result?.length
            ? storagefoldersResponse.result[0]
            : null;

        return storagefolder;
    }

    private getFolderName(): string {
        return (
            this.dealId?.toString() || `Company_${this.companyId?.toString()}`
        );
    }

    private async getFiles(folderId: number): Promise<IBXDiskFolderItem[]> {
        const filesResponse = await this.bitrix.disk.folder.getchildren({
            id: folderId,
            filter: {
                TYPE: 'file',
            },
        });
        return filesResponse.result;
    }

    private async getRootFolderId(): Promise<void> {
        const salesTaskGroupId = this.portalModel.getSalesTaskGroupId();
        const folderResponse = await this.bitrix.disk.storage.getlist({
            ENTITY_TYPE: 'group',
            ENTITY_ID: salesTaskGroupId,
        });
        let rootFloderId: number | undefined;
        if (folderResponse.result.length > 0) {
            rootFloderId = Number(folderResponse.result[0].ID);
        }
        this.rootStorageId = Number(rootFloderId);
    }
}
