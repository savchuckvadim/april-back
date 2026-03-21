import { Injectable, Logger } from '@nestjs/common';
import { StorageService, StorageType } from '@/core/storage';

import { join, dirname } from 'path';
import { LibreOfficeService } from '@/modules/libre-office';

@Injectable()
export class SupplyReportPdfService {
    private readonly logger = new Logger(SupplyReportPdfService.name);

    constructor(
        private readonly storageService: StorageService,
        private readonly libreOfficeService: LibreOfficeService,
    ) {}

    /**
     * Конвертирует Word документ в PDF
     */
    async convertToPdf(docxFilePath: string): Promise<string> {
        try {
            this.logger.log(`Converting DOCX to PDF: ${docxFilePath}`);

            // Используем LibreOffice для конвертации
            const pdfFilePath =
                await this.libreOfficeService.convertToPdf(docxFilePath);

            this.logger.log(`PDF created: ${pdfFilePath}`);

            return pdfFilePath;
        } catch (error) {
            this.logger.error(
                `Error converting to PDF: ${error.message}`,
                error.stack,
            );
            throw new Error(`Failed to convert DOCX to PDF: ${error.message}`);
        }
    }

    /**
     * Получает путь к PDF файлу (заменяет расширение)
     */
    getPdfFilePath(docxFilePath: string): string {
        return docxFilePath.replace(/\.docx$/, '.pdf');
    }
}
