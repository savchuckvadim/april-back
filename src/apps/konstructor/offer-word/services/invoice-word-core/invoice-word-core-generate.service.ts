import { OfferWordByTemplateGenerateDto } from '../../dto/offer-word-generate-request.dto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { StorageService, StorageType } from '@/core/storage';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { FileLinkService } from '@/core/file-link/file-link.service';
import dayjs from 'dayjs';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
    IInvoiceRenderData,
    IInvoiceSingleItemRenderData,
    InvoiceRenderDataService,
} from '../render-data-services/invoice-render-data.service';
import {
    InvoiceTemplateResponseDto,
    InvoiceTemplateService,
} from '@/modules/invoice-template';
import { InvoiceTemplate } from 'generated/prisma';

const RESULT_PATH = `konstructor/invoice-document/${dayjs().format('YYYY')}`;

/**
 * Только генерация оферты по шаблону: загрузка шаблона, render data, запись DOCX.
 * Без PDF, без записи шаблона в сделку, без выбора «ссылка на word/pdf» — это уровень use case / эфемерного сценария.
 */

export interface InvoiceWordCoreGenerateResult {
    docxPath: string;
    resultFileName: string;
    docxLink: string;
    renderData: IInvoiceSingleItemRenderData;
}

@Injectable()
export class InvoiceWordCoreGenerateService {
    constructor(
        private readonly invoiceTemplateService: InvoiceTemplateService,
        private readonly storageService: StorageService,
        private readonly fileLinkService: FileLinkService,
        private readonly configService: ConfigService,
        private readonly invoiceRenderDataService: InvoiceRenderDataService,
    ) {}

    async execute(dto: OfferWordByTemplateGenerateDto): Promise<{
        renderData: IInvoiceRenderData;
        template: InvoiceTemplateResponseDto;
        savedResults: InvoiceWordCoreGenerateResult[];
    }> {
        const template = await this.invoiceTemplateService.innerFindById(
            dto.invoiceTemplateId,
        );
        const savedResults: InvoiceWordCoreGenerateResult[] = [];
        if (!template) {
            throw new NotFoundException(
                `Word template with ID ${dto.templateId} not found`,
            );
        }
        //for debug/////////////////////////////////////////////////////
        const templateDto = this.invoiceTemplateService.toDto(template);
        ////////////////////////////////////////////////////////////////////
        const renderData =
            await this.invoiceRenderDataService.getInvoiceRenderData(dto);
        const singleItemRenderData =
            this.getInvoiceSingleRenderdata(renderData);
        for (const set of singleItemRenderData) {
            const saved = await this.renderSingleInvoice(
                set,
                template,
                dto.userId.toString(),
                dto.domain,
            );
            savedResults.push(saved);
        }

        return { renderData, template: templateDto, savedResults };
    }

    async renderSingleInvoice(
        renderData: IInvoiceSingleItemRenderData,
        template: InvoiceTemplate,
        userId: string,
        domain: string,
    ): Promise<InvoiceWordCoreGenerateResult> {
        const doc = await this.getTemplateDocument(template);
        doc.render(renderData);

        const saved = await this.saveRenderedDocxWithPublicLink(
            domain,
            userId,
            doc,
        );
        const docxPath = saved.docxPath;
        const resultFileName = saved.resultFileName;
        const docxLink = saved.docxLink;

        return {
            renderData,
            docxPath,
            resultFileName,
            docxLink,
        };
    }

    /**
     * Удалить сохранённый DOCX с диска. Вызывать только после того, как он больше не нужен
     * (например после успешной конвертации в PDF). До конвертации путь из execute() обязателен.
     */
    async removeSavedDocx(docxAbsolutePath: string): Promise<void> {
        await this.safeUnlink(docxAbsolutePath);
    }

    private async saveRenderedDocxWithPublicLink(
        domain: string,
        userId: string,
        doc: Docxtemplater,
    ): Promise<{ docxLink: string; docxPath: string; resultFileName: string }> {
        // сохранить файл на диск и вернуть ссылку на файл
        const resultPath = this.getResultPath(domain, userId);
        const resultFileName = this.getResultSavedFileName();

        const buf = doc.toBuffer();
        const docxPath = await this.storageService.saveFile(
            buf,
            resultFileName,
            StorageType.PUBLIC,
            resultPath,
        );
        const rootLink = await this.fileLinkService.createPublicLink(
            domain,
            Number(userId),
            'konstructor',
            'invoice-document',
            dayjs().format('YYYY'),
            resultFileName,
        );
        const baseUrl = this.configService.get('APP_URL') as string;
        const docxLink = `${baseUrl}${rootLink}`;
        return { docxLink, docxPath, resultFileName };
    }

    private async saveRenderedDocxDiskOnly(
        domain: string,
        userId: string,
        doc: Docxtemplater,
    ): Promise<{ docxPath: string; resultFileName: string }> {
        // сохранить файл на диск и вернуть путь к файлу
        const resultPath = this.getResultPath(domain, userId);
        const resultFileName = this.getResultSavedFileName();
        const buf = doc.toBuffer();
        const docxPath = await this.storageService.saveFile(
            buf,
            resultFileName,
            StorageType.PUBLIC,
            resultPath,
        );
        return { docxPath, resultFileName };
    }

    private async safeUnlink(filePath: string | null): Promise<void> {
        if (!filePath) {
            return;
        }
        try {
            if (await this.storageService.fileExists(filePath)) {
                await this.storageService.deleteFile(filePath);
            }
        } catch {
            /* ignore */
        }
    }

    private async getTemplateDocument(
        template: InvoiceTemplate,
    ): Promise<Docxtemplater> {
        const isFileExist = await this.storageService.fileExists(
            template.file_path,
        );

        if (!isFileExist) {
            throw new NotFoundException(`File ${template.file_path} not found`);
        }
        const fileBuffer = await this.storageService.readFile(
            template.file_path,
        );
        const doc = new Docxtemplater(new PizZip(fileBuffer), {
            paragraphLoop: true,
            linebreaks: true,
        });
        return doc;
    }

    protected getInvoiceSingleRenderdata(
        renderData: IInvoiceRenderData,
    ): IInvoiceSingleItemRenderData[] {
        return renderData.prices.map(price => ({
            ...renderData,
            ...price.rows,
            ...price.total,
        }));
    }
    protected getResultPath(domain: string, userId: string): string {
        return `${RESULT_PATH}/${domain}/${userId}`;
    }
    protected getResultSavedFileName(): string {
        const uuid = randomUUID();
        const resultFileName = `invoice-${uuid}.docx`;
        return resultFileName;
    }
}
