import { BitrixService } from '@lib/bitrix';
import { delay } from '@lib/shared/lib';
import { PBXService } from '@lib/pbx';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { Injectable, Logger } from '@nestjs/common';
import {
    BxDiskUploadFlowService,
    type BxDiskUploadOptions,
} from './bx-disk-upload-flow.service';
import { readFile } from 'fs/promises';
import { basename } from 'path';
import {
    DocumentLinkType,
    IPreparedDocument,
    IResultDocumentLink,
} from '../../interface/document.interface';

export interface IDocumentSaveFlowData<
    T extends DocumentLinkType = 'offer' | 'invoice',
> {
    domain: string;
    companyId: string;
    userId: number;
    dealId?: string;
    documents: IPreparedDocument<T>[];
    onlyBitrixSave?: boolean;
    /** Подпапка в папке сделки и имена без перезаписи (договоры) */
    disk?: BxDiskUploadOptions;
}

export interface IDocumentSaveFlowResult<
    T extends DocumentLinkType = 'offer' | 'invoice',
> {
    portalFolderId: number | null;
    documents: IResultDocumentLink<T>[];
    files: [string, string][];
}

/** Файл для папки на Диске: содержимое в base64 или буфером. */
export interface IDealFolderFile {
    name: string;
    content: string | Buffer;
}

export interface IDealFolderSaveData {
    domain: string;
    /** Папка сделки; сделки нет — папка `Company_{companyId}`. */
    dealId?: number | string | null;
    companyId?: number | string | null;
    /** Подпапка в папке сделки; находится по имени или создаётся. */
    subfolder: string;
    files: IDealFolderFile[];
}

export interface IDealFolderSaveResult {
    /** Ссылка на подпапку (`DETAIL_URL`); Диск её не вернул — `null`. */
    folderUrl: string | null;
    /** Загруженные файлы: имя, под которым файл лёг на Диск, и ссылка на него. */
    uploaded: { name: string; url: string | null }[];
    /** Файлы, которые Диск не принял, с причиной. */
    failed: { name: string; reason: string }[];
}

@Injectable()
export class BitrixDocumentSaveFlowService {
    private readonly logger = new Logger(BitrixDocumentSaveFlowService.name);

    constructor(private readonly pbx: PBXService) {}

    async saveDocuments<T extends DocumentLinkType = 'offer' | 'invoice'>(
        data: IDocumentSaveFlowData<T>,
    ): Promise<IDocumentSaveFlowResult<T>> {
        const { bitrix, PortalModel } = await this.pbx.init(data.domain);
        const rootFolderId = await this.getRootFolderId(bitrix, PortalModel);

        if (!rootFolderId) {
            return this.handleFallback(data, 'Root folder ID is not found');
        }

        const diskFlow = new BxDiskUploadFlowService(
            bitrix,
            PortalModel,
            data.companyId,
            data.dealId,
            data.disk,
        );

        const filesForUpload = await this.prepareFilesForUpload(data.documents);

        try {
            const { uploadedFiles } = await diskFlow.upload(filesForUpload);

            const documents: IResultDocumentLink<T>[] = data.documents.map(
                (doc, index) => ({
                    link: uploadedFiles[index]?.DETAIL_URL || doc.link,
                    name: doc.name,
                    type: doc.type,
                }),
            );

            return {
                portalFolderId: Number(uploadedFiles[0]?.ID) || null,
                documents,
                files: filesForUpload,
            };
        } catch (error) {
            return this.handleFallback(data, error);
        }
    }

    /**
     * Файлы в подпапку папки сделки на Диске: хранилище группы продаж, в
     * корне папка сделки (как у КП и договора), в ней подпапка `subfolder`.
     * Совпадающие имена получают номер и не перезаписывают друг друга.
     *
     * Нет хранилища или папки — ошибка (вызывающий решает, роняет ли она
     * операцию). Отказ на отдельном файле выкладку остальных файлов
     * продолжает: файл попадает в `failed`, ссылка на папку остаётся в ответе.
     */
    async saveFilesToDealFolder(
        data: IDealFolderSaveData,
    ): Promise<IDealFolderSaveResult> {
        if (!data.dealId && !data.companyId) {
            throw new Error(
                'Не указаны сделка и компания: папку на Диске назвать нечем',
            );
        }

        const { bitrix, PortalModel } = await this.pbx.init(data.domain);
        const diskFlow = new BxDiskUploadFlowService(
            bitrix,
            PortalModel,
            data.companyId ?? '',
            data.dealId ?? undefined,
            { subfolder: data.subfolder, uniqueNames: true },
        );
        const folder = await diskFlow.ensureTargetFolder();

        const result: IDealFolderSaveResult = {
            folderUrl: folder.url ?? null,
            uploaded: [],
            failed: [],
        };
        for (const [index, file] of data.files.entries()) {
            if (index > 0) {
                await delay(1000);
            }
            try {
                const uploaded = await diskFlow.uploadFile(
                    folder.id,
                    file.name,
                    file.content,
                );
                result.uploaded.push({
                    name: uploaded?.NAME || file.name,
                    url: uploaded?.DETAIL_URL ?? null,
                });
            } catch (error) {
                result.failed.push({
                    name: file.name,
                    reason:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }
        return result;
    }

    private handleFallback<T extends DocumentLinkType>(
        data: IDocumentSaveFlowData<T>,
        error: unknown,
    ): IDocumentSaveFlowResult<T> {
        if (data.onlyBitrixSave) {
            throw error;
        }

        this.logger.warn(
            'Bitrix Disk upload failed, using server links as fallback',
            error,
        );

        return {
            portalFolderId: null,
            documents: data.documents.map(doc => ({
                link: doc.link,
                name: doc.name,
                type: doc.type,
            })),
            files: [],
        };
    }

    private async prepareFilesForUpload(
        documents: IPreparedDocument<DocumentLinkType>[],
    ): Promise<[string, string][]> {
        const files: [string, string][] = [];
        for (const doc of documents) {
            const buffer = await readFile(doc.absolutePath);
            files.push([basename(doc.absolutePath), buffer.toString('base64')]);
        }
        return files;
    }

    private async getRootFolderId(
        bitrix: BitrixService,
        portalModel: PortalModel,
    ): Promise<number | undefined> {
        const salesTaskGroupId = portalModel.getSalesTaskGroupId();
        const folderResponse = await bitrix.disk.storage.getlist({
            ENTITY_TYPE: 'group',
            ENTITY_ID: salesTaskGroupId,
        });
        if (folderResponse.result.length > 0) {
            return Number(folderResponse.result[0].ID);
        }
        return undefined;
    }
}
