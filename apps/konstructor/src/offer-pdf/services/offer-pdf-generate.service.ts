import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
import { StorageService, StorageType } from '@lib/core/storage/storage.service';
import { IPreparedDocument } from '@app/konstructor/offer-word/interface/document.interface';
import { getOfferDocumentProductName } from '@app/konstructor/offer-word/lib/get-offer-document-product-name.util';
import { BitrixDocumentSaveFlowService } from '@app/konstructor/offer-word/services/bitrix/bitrix-document-save-flow.service';
import { OfferBxTimelineService } from '@app/konstructor/offer-word/services/bitrix/offer-bx-timeline.service';
import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfDocumentModelService } from './offer-pdf-document-model.service';
import {
    OfferPdfRenderResult,
    OfferPdfRenderService,
} from './offer-pdf-render.service';

/** Итог прикрепления к сделке Битрикса */
export interface OfferPdfDealResult {
    /** Файл загружен на Диск Битрикса и упомянут в таймлайне сделки */
    savedToDeal: boolean;
    /** Ссылка на файл в Битриксе — когда загрузка удалась */
    bitrixLink: string | null;
    /** Почему к сделке не прикрепили — текст для пользователя */
    dealMessage: string | null;
}

export interface OfferPdfGenerateResult extends OfferPdfDealResult {
    /** Публичная ссылка на PDF на нашем сервере */
    link: string;
    fileName: string;
    templateCode: OfferPdfTemplateCode;
    durationMs: number;
    /** Размер файла в байтах */
    size: number;
}

interface SavedPdf {
    absolutePath: string;
    fileName: string;
    link: string;
}

/**
 * Подкаталог публичного хранилища и ссылок (/api/files/<token>):
 * konstructor/offer/<год>/<домен>/<пользователь>/offer-<uuid>.pdf
 */
const RESULT_SUB_DIR = 'offer' as const;

/**
 * Предпросмотр — только буфер. Генерация — файл в хранилище + ссылка,
 * затем (если не отключено) Диск Битрикса и таймлайн сделки — теми же
 * сервисами, что и Word-поток. Сбой Битрикса документ не отменяет:
 * ссылка на сервер отдаётся всегда, причина — в dealMessage.
 */
@Injectable()
export class OfferPdfGenerateService {
    private readonly logger = new Logger(OfferPdfGenerateService.name);

    constructor(
        private readonly modelService: OfferPdfDocumentModelService,
        private readonly renderService: OfferPdfRenderService,
        private readonly storage: StorageService,
        private readonly fileLink: FileLinkService,
        private readonly config: ConfigService,
        private readonly bxSaveFlow: BitrixDocumentSaveFlowService,
        private readonly timeline: OfferBxTimelineService,
    ) {}

    async preview(dto: OfferPdfGenerateDto): Promise<OfferPdfRenderResult> {
        const model = await this.modelService.build(dto);
        return this.renderService.render(model);
    }

    async generate(dto: OfferPdfGenerateDto): Promise<OfferPdfGenerateResult> {
        const rendered = await this.preview(dto);
        const saved = await this.saveToStorage(dto, rendered.buffer);
        const deal =
            dto.saveToDeal === false
                ? { savedToDeal: false, bitrixLink: null, dealMessage: null }
                : await this.attachToDeal(dto, saved);

        return {
            link: saved.link,
            fileName: saved.fileName,
            templateCode: rendered.templateCode,
            durationMs: rendered.durationMs,
            size: rendered.buffer.length,
            ...deal,
        };
    }

    private async saveToStorage(
        dto: OfferPdfGenerateDto,
        buffer: Buffer,
    ): Promise<SavedPdf> {
        const year = dayjs().format('YYYY');
        const fileName = `offer-${randomUUID()}.pdf`;
        const absolutePath = await this.storage.saveFile(
            buffer,
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
        return { absolutePath, fileName, link: `${baseUrl}${rootLink}` };
    }

    /**
     * Диск Битрикса + комментарий в таймлайн. saveDocuments без
     * onlyBitrixSave при сбое Диска сам подставляет серверную ссылку —
     * тогда bitrixLink пустой, а комментарий всё равно уходит.
     */
    private async attachToDeal(
        dto: OfferPdfGenerateDto,
        saved: SavedPdf,
    ): Promise<OfferPdfDealResult> {
        const document: IPreparedDocument = {
            absolutePath: saved.absolutePath,
            link: saved.link,
            name: getOfferDocumentProductName(dto),
            type: 'offer',
        };
        const target = {
            domain: dto.domain,
            companyId: dto.companyId,
            userId: dto.userId,
            dealId: dto.dealId,
        };
        try {
            const result = await this.bxSaveFlow.saveDocuments({
                ...target,
                documents: [document],
                onlyBitrixSave: false,
            });
            const uploaded = result.documents[0];
            const bitrixLink =
                uploaded && uploaded.link !== saved.link ? uploaded.link : null;
            await this.timeline.sendDocumentToBitrix({
                ...target,
                documents: result.documents,
            });
            return {
                savedToDeal: bitrixLink !== null,
                bitrixLink,
                dealMessage: bitrixLink
                    ? null
                    : 'Файл не загрузился на Диск Битрикса — в сделку ушла ссылка на сервер',
            };
        } catch (error) {
            const reason =
                error instanceof Error ? error.message : 'ошибка Битрикса';
            this.logger.warn(
                `КП PDF: не удалось прикрепить к сделке ${dto.dealId} (${dto.domain}) — ${reason}`,
            );
            return {
                savedToDeal: false,
                bitrixLink: null,
                dealMessage: `Не удалось прикрепить файл к сделке: ${reason}`,
            };
        }
    }
}
