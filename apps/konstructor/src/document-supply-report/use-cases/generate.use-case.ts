import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentSupplyReportGenerateDto } from '../dto/document-supply-report-generate.dto';
import { SupplyReportDataService } from '../services/data/supply-report-data.service';
import { SupplyReportTemplateService } from '../services/template/supply-report-template.service';
import { SupplyReportPdfService } from '../services/pdf/supply-report-pdf.service';
import { SupplyReportBitrixService } from '../services/bitrix/supply-report-bitrix.service';
import { PortalService } from '@lib/portal-lib/portal';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
import dayjs from 'dayjs';
import { PBXService } from '@lib/pbx';
import { getErrorString } from '@lib/shared';
import { SupplyReportGenerateResultDto } from '../dto/document-supply-report-response.dto';

@Injectable()
export class GenerateUseCase {
    private readonly logger = new Logger(GenerateUseCase.name);

    constructor(
        private readonly dataService: SupplyReportDataService,
        private readonly templateService: SupplyReportTemplateService,
        private readonly pdfService: SupplyReportPdfService,
        private readonly pbx: PBXService,
        private readonly portalService: PortalService,
        private readonly fileLinkService: FileLinkService,
        private readonly configService: ConfigService,
    ) {}

    /**
     * Собирает отчёт о поставке и возвращает ссылки на него.
     *
     * Ошибки НЕ гасятся в `{success:false}`: их подхватывает
     * GlobalExceptionFilter (и шлёт алерт), а фронт видит ненулевой resultCode.
     * Исключение — побочные эффекты (PDF, комментарий в таймлайн): из-за них
     * терять уже собранный документ нельзя.
     */
    async execute(
        dto: DocumentSupplyReportGenerateDto,
    ): Promise<SupplyReportGenerateResultDto> {
        const { domain, userId, dealId } = dto;
        const { bitrix } = await this.pbx.init(domain);
        const bitrixService = new SupplyReportBitrixService(bitrix);

        const portal = await this.portalService.getPortalByDomain(domain);

        // второй шаблон (supply_report_gsr.docx) сейчас нигде не включается
        const isNewTemplate = true;

        const templateData = this.dataService.prepareTemplateData(dto);

        const { filePath: docxFilePath, fileName } =
            await this.templateService.createWordDocument(
                templateData,
                domain,
                userId,
                isNewTemplate,
            );

        const currentYear = dayjs().format('YYYY');
        const link = await this.buildAbsoluteLink(
            domain,
            userId,
            currentYear,
            fileName,
        );

        const pdfLink = await this.createPdfLink(
            docxFilePath,
            fileName,
            domain,
            userId,
            currentYear,
        );

        if (dealId) {
            try {
                await bitrixService.addTimelineComment(
                    portal,
                    dealId,
                    fileName,
                    link,
                    pdfLink,
                );
            } catch (error) {
                this.logger.warn(
                    `Комментарий в таймлайн сделки ${dealId} не ушёл: ${getErrorString(error)}`,
                );
            }
        }

        return {
            link,
            // отдельного base64-роута (Laravel supply-report) в несте нет,
            // а init-supply скачивает файл именно по прямой ссылке
            document: link,
            file: link,
            pdfLink,
        };
    }

    /**
     * Абсолютная ссылка на файл.
     *
     * `FileLinkService` отдаёт относительный `/api/files/<token>`, а ссылка
     * уходит наружу: её скачивает init-supply (axios без базового домена) и
     * открывает менеджер из таймлайна.
     */
    private async buildAbsoluteLink(
        domain: string,
        userId: number,
        year: string,
        fileName: string,
    ): Promise<string> {
        const rootLink = await this.fileLinkService.createPublicLink(
            domain,
            userId,
            'konstructor',
            'supply',
            year,
            fileName,
        );

        const baseUrl = (
            this.configService.get<string>('APP_URL') ?? ''
        ).replace(/\/+$/, '');

        return `${baseUrl}${rootLink}`;
    }

    /** PDF-версия отчёта. Не получилось — отчёт всё равно отдаём. */
    private async createPdfLink(
        docxFilePath: string,
        fileName: string,
        domain: string,
        userId: number,
        year: string,
    ): Promise<string | undefined> {
        try {
            await this.pdfService.convertToPdf(docxFilePath);
            const pdfFileName = fileName.replace(/\.docx$/, '.pdf');
            return await this.buildAbsoluteLink(
                domain,
                userId,
                year,
                pdfFileName,
            );
        } catch (error) {
            this.logger.warn(
                `Конвертация отчёта в PDF не удалась: ${getErrorString(error)}`,
            );
            return undefined;
        }
    }
}
