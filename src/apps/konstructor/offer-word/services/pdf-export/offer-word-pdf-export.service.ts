import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LibreOfficeService } from '@/modules/libre-office';
import { FileLinkService } from '@/core/file-link/file-link.service';

export type OfferWordPdfExportParams = {
    docxAbsolutePath: string;
    docxFileName: string;
    domain: string;
    userId: number;
    year: string;
    type: 'offer' | 'invoice';
};

/**
 * DOCX уже лежит в public storage; конвертация пишет PDF рядом, затем строится публичная ссылка.
 */
@Injectable()
export class OfferWordPdfExportService {
    constructor(
        private readonly libreOfficeService: LibreOfficeService,
        private readonly fileLinkService: FileLinkService,
        private readonly configService: ConfigService,
    ) {}

    /**
     * Только конвертация DOCX → PDF на диске (рядом с исходником).
     * Публичные ссылки не создаются.
     */
    async convertDocxToPdfPath(docxAbsolutePath: string): Promise<string> {
        return this.libreOfficeService.convertToPdf(docxAbsolutePath);
    }

    async buildPublicPdfLink(
        params: OfferWordPdfExportParams,
    ): Promise<string> {
        await this.convertDocxToPdfPath(params.docxAbsolutePath);
        const pdfFileName = params.docxFileName.replace(/\.docx$/i, '.pdf');
        const rootLink = await this.fileLinkService.createPublicLink(
            params.domain,
            params.userId,
            'konstructor',
            params.type === 'offer' ? 'offer-word' : 'invoice-document',
            params.year,
            pdfFileName,
        );
        const baseUrl = this.configService.get<string>('APP_URL', '');
        return `${baseUrl}${rootLink}`;
    }
}
