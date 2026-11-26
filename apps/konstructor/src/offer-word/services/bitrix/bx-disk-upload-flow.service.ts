import { delay } from '@lib/shared/lib';
import { BitrixService } from '@lib/bitrix';
import {
    IBXDiskFolderItem,
    IBXDiskStorageChildItem,
} from '@lib/bitrix/domain/disk';
import { base64ByteSize } from '@lib/bitrix/core/base/bitrix-log-redact.util';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { noteOfferFailureFile } from '../../lib/offer-generation-failure.util';

/** Куда и как класть файлы внутри папки сделки. */
export interface BxDiskUploadOptions {
    /** Подпапка в папке сделки (например, «Договоры»); нет — прямо в папку сделки, как КП. */
    subfolder?: string;
    /** Файл с тем же именем не перезаписывается и не ломает загрузку: Битрикс добавит номер. */
    uniqueNames?: boolean;
}

/** Папка на Диске: id для загрузки и ссылка (`DETAIL_URL`) для людей. */
export interface BxDiskFolderRef {
    id: number;
    url: string | undefined;
}

export class BxDiskUploadFlowService {
    private rootStorageId: number | undefined;
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portalModel: PortalModel,
        private readonly companyId: number | string,
        private readonly dealId?: number | string,
        private readonly options: BxDiskUploadOptions = {},
    ) {}

    public async upload(files: [string, string][]): Promise<{
        uploadedFiles: IBXDiskFolderItem[];
        folderUrl: string | undefined;
    }> {
        const target = await this.ensureTargetFolder();
        const uploadedFiles = await this.uploadFiles(target.id, files);
        return { uploadedFiles, folderUrl: target.url };
    }

    /**
     * Папка назначения: папка сделки (или компании) в хранилище группы продаж,
     * внутри неё подпапка из `options.subfolder`. Каждая найдётся по имени или
     * создастся. Нет хранилища группы — ошибка.
     */
    public async ensureTargetFolder(): Promise<BxDiskFolderRef> {
        await this.getRootFolderId();
        if (!this.rootStorageId) {
            throw new Error('Root storage folder ID is not found');
        }

        const existingStoragefolder = await this.getExistingFolder();

        const currentFolder = await this.refreshExistingFolder(
            existingStoragefolder,
        );
        if (!currentFolder || !currentFolder.ID) {
            throw new Error('New storage folder ID is not set');
        }
        return this.options.subfolder
            ? await this.ensureSubfolder(
                  Number(currentFolder.ID),
                  this.options.subfolder,
              )
            : { id: Number(currentFolder.ID), url: currentFolder.DETAIL_URL };
    }

    /**
     * Один файл в папку. Содержимое — base64-строкой или буфером; имя берётся
     * как есть (с `uniqueNames` Битрикс допишет номер к занятому имени).
     */
    public async uploadFile(
        folderId: number,
        name: string,
        content: string | Buffer,
    ): Promise<IBXDiskFolderItem> {
        const base64 =
            typeof content === 'string' ? content : content.toString('base64');
        try {
            const response = await this.bitrix.disk.folder.uploadfile({
                id: folderId,
                data: {
                    NAME: name,
                },
                fileContent: [name, base64],
                ...(this.options.uniqueNames
                    ? { generateUniqueName: true }
                    : {}),
            });
            return response.result;
        } catch (error) {
            // имя и размер (без содержимого) пойдут в журнал сбоя генерации
            noteOfferFailureFile(error, {
                name,
                sizeBytes:
                    typeof content === 'string'
                        ? base64ByteSize(content)
                        : content.length,
            });
            throw error;
        }
    }

    /** Подпапка в папке сделки: найти по имени или создать. */
    private async ensureSubfolder(
        parentId: number,
        name: string,
    ): Promise<{ id: number; url: string | undefined }> {
        const existing = await this.bitrix.disk.folder.getchildren({
            id: parentId,
            filter: { TYPE: 'folder', NAME: name },
        });
        const found = existing.result?.[0];
        if (found?.ID) return { id: Number(found.ID), url: found.DETAIL_URL };

        const created = await this.bitrix.disk.folder.addsubfolder({
            id: parentId,
            data: { NAME: name },
        });
        if (!created.result?.ID) {
            throw new Error(`Disk subfolder «${name}» is not created`);
        }
        return {
            id: Number(created.result.ID),
            url: created.result.DETAIL_URL,
        };
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
            return existingStoragefolder;
            // //если папка существует, то удаляем ее
            // void (await this.bitrix.disk.folder.deletetree({
            //     id: Number(existingStoragefolder.ID),
            // }));
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
        for (const [name, base64] of files) {
            results.push(await this.uploadFile(folderId, name, base64));
            await delay(1000);
        }
        return results;
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
