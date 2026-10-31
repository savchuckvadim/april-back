import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
import { StorageService, StorageType } from '@lib/core/storage/storage.service';
import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfDocumentModelService } from './offer-pdf-document-model.service';
import {
    OfferPdfRenderResult,
    OfferPdfRenderService,
} from './offer-pdf-render.service';

export interface OfferPdfGenerateResult {
    /** Публичная ссылка на PDF */
    link: string;
    fileName: string;
    templateCode: OfferPdfTemplateCode;
    durationMs: number;
    /** Размер файла в байтах */
    size: number;
}

/**
 * Подкаталог публичного хранилища и ссылок (/api/files/<token>):
 * konstructor/offer/<год>/<домен>/<пользователь>/offer-<uuid>.pdf
 */
const RESULT_SUB_DIR = 'offer' as const;

/** Предпросмотр — только буфер; генерация — файл в хранилище + ссылка. */
@Injectable()
export class OfferPdfGenerateService {
    constructor(
        private readonly modelService: OfferPdfDocumentModelService,
        private readonly renderService: OfferPdfRenderService,
        private readonly storage: StorageService,
        private readonly fileLink: FileLinkService,
        private readonly config: ConfigService,
    ) {}

    async preview(dto: OfferPdfGenerateDto): Promise<OfferPdfRenderResult> {
        const model = await this.modelService.build(dto);
        return this.renderService.render(model);
    }

    async generate(dto: OfferPdfGenerateDto): Promise<OfferPdfGenerateResult> {
        const rendered = await this.preview(dto);
        const year = dayjs().format('YYYY');
        const fileName = `offer-${randomUUID()}.pdf`;

        await this.storage.saveFile(
            rendered.buffer,
            fileName,
            StorageType.PUBLIC,
            `konstructor/${RESULT_SUB_DIR}/${year}/${dto.domain}/${dto.userId}`,
        );
        const rootLink = await this.fileLink.createPublicLink(
            dto.domain,
            dto.userId,
            'konstructor',
            RESULT_SUB_DIR,
            year,
            fileName,
        );
        const baseUrl = this.config.get<string>('APP_URL', '');

        return {
            link: `${baseUrl}${rootLink}`,
            fileName,
            templateCode: rendered.templateCode,
            durationMs: rendered.durationMs,
            size: rendered.buffer.length,
        };
    }
}
