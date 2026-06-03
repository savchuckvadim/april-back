import { BitrixService } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { Injectable, Logger } from '@nestjs/common';
import { BxDiskUploadFlowService } from './bx-disk-upload-flow.service';
import { readFile } from 'fs/promises';
import { basename } from 'path';
import {
    IPreparedDocument,
    IResultDocumentLink,
} from '../../interface/document.interface';

export interface IDocumentSaveFlowData {
    domain: string;
    companyId: string;
    userId: number;
    dealId?: string;
    documents: IPreparedDocument[];
    onlyBitrixSave?: boolean;
}

export interface IDocumentSaveFlowResult {
    portalFolderId: number | null;
    documents: IResultDocumentLink[];
    files: [string, string][];
}

@Injectable()
export class BitrixDocumentSaveFlowService {
    private readonly logger = new Logger(BitrixDocumentSaveFlowService.name);

    constructor(private readonly pbx: PBXService) {}

    async saveDocuments(
        data: IDocumentSaveFlowData,
    ): Promise<IDocumentSaveFlowResult> {
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
        );

        const filesForUpload = await this.prepareFilesForUpload(data.documents);

        try {
            const { uploadedFiles } = await diskFlow.upload(filesForUpload);

            const documents: IResultDocumentLink[] = data.documents.map(
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

    private handleFallback(
        data: IDocumentSaveFlowData,
        error: unknown,
    ): IDocumentSaveFlowResult {
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
        documents: IPreparedDocument[],
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
