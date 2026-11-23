import { OfferWordByTemplateGenerateDto } from '../../dto/offer-word-generate-request.dto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { StorageService, StorageType } from '@lib/core/storage';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
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
} from '@app/konstructor/modules/invoice-template';
import { InvoiceTemplate } from 'generated/prisma';
import {
    INVOICE_TEMPLATE_NOT_FOUND_REASON,
    InvoiceTemplateSourceService,
} from './invoice-template-source.service';

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

/**
 * Итог сборки счетов. Шаблона нет — `savedResults` пуст, `renderData` и
 * `template` равны null, `notBuiltReason` хранит причину для менеджера.
 */
export interface InvoiceWordCoreExecuteResult {
    renderData: IInvoiceRenderData | null;
    template: InvoiceTemplateResponseDto | null;
    savedResults: InvoiceWordCoreGenerateResult[];
    /** Заполнено, когда счёт не построен: текст причины для менеджера. */
    notBuiltReason?: string;
}

@Injectable()
export class InvoiceWordCoreGenerateService {
    constructor(
        private readonly invoiceTemplateService: InvoiceTemplateService,
        private readonly invoiceTemplateSource: InvoiceTemplateSourceService,
        private readonly storageService: StorageService,
        private readonly fileLinkService: FileLinkService,
        private readonly configService: ConfigService,
        private readonly invoiceRenderDataService: InvoiceRenderDataService,
    ) {}

    async execute(
        dto: OfferWordByTemplateGenerateDto,
    ): Promise<InvoiceWordCoreExecuteResult> {
        const template = await this.invoiceTemplateSource.resolve(dto);
        const savedResults: InvoiceWordCoreGenerateResult[] = [];
        if (!template) {
            return {
                renderData: null,
                template: null,
                savedResults,
                notBuiltReason: INVOICE_TEMPLATE_NOT_FOUND_REASON,
            };
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
            throw new NotFoundException(
                `Файл шаблона счёта не найден в хранилище: ${template.file_path}`,
            );
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
