import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '@/core/storage';
import { DocumentSupplyReportGenerateDto } from '../dto/document-supply-report-generate.dto';
import { SupplyReportDataService } from '../services/data/supply-report-data.service';
import { SupplyReportTemplateService } from '../services/template/supply-report-template.service';
import { SupplyReportPdfService } from '../services/pdf/supply-report-pdf.service';
import { SupplyReportBitrixService } from '../services/bitrix/supply-report-bitrix.service';
import { PortalService } from '@/modules/portal';
import { FileLinkService } from '@/core/file-link/file-link.service';
import dayjs from 'dayjs';
import { PBXService } from '@/modules/pbx';

@Injectable()
export class GenerateUseCase {
    private readonly logger = new Logger(GenerateUseCase.name);

    constructor(
        private readonly storageService: StorageService,
        private readonly dataService: SupplyReportDataService,
        private readonly templateService: SupplyReportTemplateService,
        private readonly pdfService: SupplyReportPdfService,
        private readonly pbx: PBXService,
        // private readonly bitrixService: SupplyReportBitrixService,
        private readonly portalService: PortalService,
        private readonly fileLinkService: FileLinkService,
    ) {}

    async execute(dto: DocumentSupplyReportGenerateDto): Promise<{
        success: boolean;
        data?: {
            link: string;
            document: string;
            file: string;
            pdfLink?: string;
        };
        error?: string;
    }> {
        try {
            const { domain, userId, dealId, companyId } = dto;
            const { bitrix } = await this.pbx.init(domain);
            const bitrixService = new SupplyReportBitrixService(bitrix);

            // Получаем портал
            const portal = await this.portalService.getPortalByDomain(domain);

            // Определяем, использовать ли новый шаблон
            const isNewTemplate = true; // Можно сделать настраиваемым

            // Подготавливаем данные для шаблона
            this.logger.log('Preparing template data...');
            const templateData = this.dataService.prepareTemplateData(dto);

            // Создаем Word документ
            this.logger.log('Creating Word document...');
            const { filePath: docxFilePath, fileName } =
                await this.templateService.createWordDocument(
                    templateData,
                    domain,
                    userId,
                    isNewTemplate,
                );

            // Создаем публичную ссылку на Word документ
            const currentYear = dayjs().format('YYYY');
            const link = await this.fileLinkService.createPublicLink(
                domain,
                userId,
                'konstructor',
                'supply',
                currentYear,
                fileName,
            );

            // Извлекаем hash из пути для создания других ссылок
            const pathParts = docxFilePath.split('/');
            const hashIndex = pathParts.findIndex(
                part => part.length === 8 && /^[a-f0-9]+$/i.test(part),
            );
            const hash = hashIndex !== -1 ? pathParts[hashIndex] : '';

            const document = link; // Можно использовать тот же формат
            const file = link; // Можно использовать тот же формат

            let pdfLink: string | undefined;

            // Конвертируем в PDF если используется новый шаблон
            if (isNewTemplate) {
                try {
                    this.logger.log('Converting to PDF...');
                    const pdfFilePath =
                        await this.pdfService.convertToPdf(docxFilePath);

                    // Создаем ссылку на PDF
                    const pdfFileName = fileName.replace('.docx', '.pdf');
                    pdfLink = await this.fileLinkService.createPublicLink(
                        domain,
                        userId,
                        'konstructor',
                        'supply',
                        currentYear,
                        pdfFileName,
                    );

                    this.logger.log(`PDF created: ${pdfFilePath}`);
                } catch (error) {
                    this.logger.warn(
                        `Failed to convert to PDF: ${error.message}`,
                    );
                    // Не прерываем выполнение, если конвертация в PDF не удалась
                }
            }

            // Отправляем комментарий в Bitrix
            if (dealId) {
                try {
                    this.logger.log('Adding timeline comment to Bitrix...');
                    await bitrixService.addTimelineComment(
                        portal,
                        dealId,
                        fileName,
                        link,
                    );
                } catch (error) {
                    this.logger.warn(
                        `Failed to add timeline comment: ${error.message}`,
                    );
                    // Не прерываем выполнение, если отправка комментария не удалась
                }
            }

            return {
                success: true,
                data: {
                    link,
                    document,
                    file,
                    pdfLink,
                },
            };
        } catch (error) {
            this.logger.error(
                `Error generating supply report: ${error.message}`,
                error.stack,
            );
            return {
                success: false,
                error: error.message,
            };
        }
    }
}
