import { Injectable, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import {
    StorageService,
    StorageType,
} from '../../../../core/storage/storage.service';
import {
    DOCUMENT_TAGS_FILE_NAME,
    DOCUMENT_TAGS_MIME_TYPE,
    DOCUMENT_TAGS_SUBPATH,
} from '../constants/document-tags.constants';

@Injectable()
export class DocumentTagsFileService {
    constructor(private readonly storageService: StorageService) {}

    async upload(file: Express.Multer.File): Promise<{ path: string }> {
        const savedPath = await this.storageService.saveFile(
            file.buffer,
            DOCUMENT_TAGS_FILE_NAME,
            StorageType.APP,
            DOCUMENT_TAGS_SUBPATH,
        );
        return { path: savedPath };
    }

    async download(res: Response): Promise<void> {
        const filePath = this.storageService.getFilePath(
            StorageType.APP,
            DOCUMENT_TAGS_SUBPATH,
            DOCUMENT_TAGS_FILE_NAME,
        );

        const exists = await this.storageService.fileExists(filePath);
        if (!exists) {
            throw new NotFoundException(
                `${DOCUMENT_TAGS_FILE_NAME} not found in storage`,
            );
        }

        const fileBuffer = await this.storageService.readFile(filePath);

        res.setHeader('Content-Type', DOCUMENT_TAGS_MIME_TYPE);
        res.setHeader(
            'Content-Disposition',
            `attachment; filename=${DOCUMENT_TAGS_FILE_NAME}`,
        );

        res.setHeader('Content-Length', fileBuffer.length.toString());
        res.end(fileBuffer);
    }
}
