import { Injectable, Logger } from '@nestjs/common';
import { LibreOfficeService } from '@app/konstructor/modules/libre-office';
import { getErrorStack, getErrorString } from '@lib/shared';

@Injectable()
export class SupplyReportPdfService {
    private readonly logger = new Logger(SupplyReportPdfService.name);

    constructor(private readonly libreOfficeService: LibreOfficeService) {}

    /** Конвертирует docx отчёта в PDF и отдаёт путь к нему. */
    async convertToPdf(docxFilePath: string): Promise<string> {
        try {
            const pdfFilePath =
                await this.libreOfficeService.convertToPdf(docxFilePath);

            this.logger.log(`PDF отчёта собран: ${pdfFilePath}`);

            return pdfFilePath;
        } catch (error) {
            this.logger.error(
                `Не удалось конвертировать отчёт в PDF: ${getErrorString(error)}`,
                getErrorStack(error),
            );
            throw error;
        }
    }

    /** Путь к PDF по пути docx — только замена расширения. */
    getPdfFilePath(docxFilePath: string): string {
        return docxFilePath.replace(/\.docx$/, '.pdf');
    }
}
