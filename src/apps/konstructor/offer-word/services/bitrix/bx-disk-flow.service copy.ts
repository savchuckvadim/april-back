import { delay } from '@/lib';
import { BitrixService } from '@/modules/bitrix';
import {
    IBXDiskFolderItem,
    IBXDiskStorageChildItem,
} from '@/modules/bitrix/domain/disk';
import { PortalModel } from '@/modules/portal/services/portal.model';

export class BxDiskFlowService {
    private rootStorageId: number | undefined;
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portalModel: PortalModel,
        private readonly companyId: number | string,
        private readonly dealId?: number | string,
    ) {}

    public async upload(files: [string, string][]): Promise<{
        uploadedFiles: IBXDiskFolderItem[];
        folderUrl: string | undefined;
    }> {
        await this.getRootFolderId();
        if (!this.rootStorageId) {
            throw new Error('Root storage folder ID is not found');
        }
        const existingStoragefolder = await this.getExistingFolder();
        const newStoragefolder = await this.refreshExistingFolder(
            existingStoragefolder,
        );
        if (!newStoragefolder || !newStoragefolder.ID) {
            throw new Error('New storage folder ID is not set');
        }
        const folderId = Number(newStoragefolder.ID);
        const uploadedFiles = await this.uploadFiles(folderId, files);
        return { uploadedFiles, folderUrl: newStoragefolder.DETAIL_URL };
    }

    public async get(): Promise<{ files: [string, string][] }> {
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

    private async refreshExistingFolder(
        existingStoragefolder: IBXDiskStorageChildItem | null,
    ): Promise<IBXDiskStorageChildItem | null> {
        if (existingStoragefolder) {
            //если папка существует, то удаляем ее
            void (await this.bitrix.disk.folder.deletetree({
                id: Number(existingStoragefolder.ID),
            }));
        }

        const storagefoldersResponse = await this.bitrix.disk.storage.addfolder(
            {
                id: Number(this.rootStorageId),
                data: {
                    NAME: this.getFolderName(),
                },
                rights: [],
            },
        );
        const newStoragefolder = storagefoldersResponse.result;
        return newStoragefolder;
    }

    private getFolderName(): string {
        return (
            this.dealId?.toString() || `Company_${this.companyId?.toString()}`
        );
    }

    private async uploadFiles(
        folderId: number,
        files: [string, string][],
    ): Promise<IBXDiskFolderItem[]> {
        const results: IBXDiskFolderItem[] = [];
        for (const file of files) {
            const response = await this.bitrix.disk.folder.uploadfile({
                id: folderId,
                data: {
                    NAME: file[0],
                },
                fileContent: file,
            });
            results.push(response.result);
            await delay(1000);
        }
        return results;
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
