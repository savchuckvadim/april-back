import {
    WordTemplate,
    WordTemplateService,
} from '@/modules/offer-template/word';
import { OfferWordByTemplateGenerateDto } from '../../dto/offer-word-generate-request.dto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { StorageService, StorageType } from '@/core/storage';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { FileLinkService } from '@/core/file-link/file-link.service';
import dayjs from 'dayjs';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { OfferRenderDataService } from '../render-data-services/offer-render-data.service';
import {
    OfferWordCoreGenerateOptions,
    OfferWordCoreGenerateResult,
} from '../../types/offer-word-core-generate.types';

const RESULT_PATH = `konstructor/offer-word/${dayjs().format('YYYY')}`;

/**
 * Только генерация оферты по шаблону: загрузка шаблона, render data, запись DOCX.
 * Без PDF, без записи шаблона в сделку, без выбора «ссылка на word/pdf» — это уровень use case / эфемерного сценария.
 */
@Injectable()
export class OfferWordCoreGenerateService {
    constructor(
        private readonly wordTemplateService: WordTemplateService,
        private readonly storageService: StorageService,
        private readonly fileLinkService: FileLinkService,
        private readonly configService: ConfigService,
        private readonly documentRenderDataService: OfferRenderDataService,
    ) {}

    async execute(
        dto: OfferWordByTemplateGenerateDto,
        options: OfferWordCoreGenerateOptions,
    ): Promise<OfferWordCoreGenerateResult> {
        const userId = dto.userId;
        const template = await this.wordTemplateService.findById(
            BigInt(dto.templateId),
        );
        if (!template) {
            throw new NotFoundException(
                `Word template with ID ${dto.templateId} not found`,
            );
        }

        const doc = await this.getTemplateDocument(template);
        const renderData =
            await this.documentRenderDataService.getOfferRenderData(dto);
        doc.render(renderData);

        let docxPath: string;
        let resultFileName: string;
        let docxLink: string | undefined;

        if (options.publishDocxLink) {
            const saved = await this.saveRenderedDocxWithPublicLink(
                dto.domain,
                userId.toString(),
                doc,
            );
            docxPath = saved.docxPath;
            resultFileName = saved.resultFileName;
            docxLink = saved.docxLink;
        } else {
            const saved = await this.saveRenderedDocxDiskOnly(
                dto.domain,
                userId.toString(),
                doc,
            );
            docxPath = saved.docxPath;
            resultFileName = saved.resultFileName;
        }

        return {
            template,
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
        const resultPath = `${RESULT_PATH}/${domain}/${userId}`;
        const uuid = randomUUID();
        const resultFileName = `offer-${uuid}.docx`;

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
            'offer-word',
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
        const resultPath = `${RESULT_PATH}/${domain}/${userId}`;
        const uuid = randomUUID();
        const resultFileName = `offer-${uuid}.docx`;
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
        template: WordTemplate,
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
}
