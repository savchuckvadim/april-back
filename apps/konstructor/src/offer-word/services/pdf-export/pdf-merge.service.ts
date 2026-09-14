import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { randomUUID } from 'crypto';
import { StorageService, StorageType } from '@lib/core/storage';
import { FileLinkService } from '@lib/core/file-link/file-link.service';

export interface PdfMergeParams {
    /** Абсолютные пути PDF в порядке склейки. */
    pdfAbsolutePaths: string[];
    domain: string;
    userId: number;
    year: string;
}

export interface PdfMergeResult {
    absolutePath: string;
    link: string;
    fileName: string;
}

/**
 * Склейка нескольких PDF в один: КП «на каждый набор своя страница».
 *
 * Именно PDF, а не DOCX: docx-файлы с разными стилями и нумерацией надёжно
 * не сливаются, а PDF после LibreOffice — просто страницы. В Word-режиме
 * документы отдаются по одному.
 */
@Injectable()
export class PdfMergeService {
    private readonly logger = new Logger(PdfMergeService.name);

    constructor(
        private readonly storageService: StorageService,
        private readonly fileLinkService: FileLinkService,
        private readonly configService: ConfigService,
    ) {}

    async merge(params: PdfMergeParams): Promise<PdfMergeResult> {
        const merged = await PDFDocument.create();

        for (const pdfPath of params.pdfAbsolutePaths) {
            const bytes = await this.storageService.readFile(pdfPath);
            const source = await PDFDocument.load(bytes);
            const pages = await merged.copyPages(
                source,
                source.getPageIndices(),
            );
            for (const page of pages) {
                merged.addPage(page);
            }
        }

        const buffer = Buffer.from(await merged.save());
        const fileName = `offer-${randomUUID()}.pdf`;
        const subPath = `konstructor/offer-word/${params.year}/${params.domain}/${params.userId}`;
        const absolutePath = await this.storageService.saveFile(
            buffer,
            fileName,
            StorageType.PUBLIC,
            subPath,
        );
        const rootLink = await this.fileLinkService.createPublicLink(
            params.domain,
            params.userId,
            'konstructor',
            'offer-word',
            params.year,
            fileName,
        );
        const baseUrl = this.configService.get<string>('APP_URL', '');

        this.logger.log(
            `${params.domain}: склеено ${params.pdfAbsolutePaths.length} PDF → ${fileName}`,
        );
        return { absolutePath, link: `${baseUrl}${rootLink}`, fileName };
    }
}
