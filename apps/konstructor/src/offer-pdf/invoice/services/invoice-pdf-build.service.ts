import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
import { StorageService, StorageType } from '@lib/core/storage/storage.service';
import { IPreparedDocument } from '@app/konstructor/offer-word/interface/document.interface';
import { getInvoiceDiskName } from '@app/konstructor/offer-word/lib/document-disk-name.util';
import { getInvoiceDocumentProductName } from '@app/konstructor/offer-word/lib/get-invoice-document-product-name';
import { InvoiceBuildRequest } from '@app/konstructor/offer-word/types/invoice-build-request.type';
import {
    InvoicePdfModelItem,
    InvoicePdfModelService,
} from './invoice-pdf-model.service';
import { InvoicePdfRenderService } from './invoice-pdf-render.service';

/** Подкаталог публичного хранилища и ссылок: там же лежат Word-счета. */
const RESULT_SUB_DIR = 'invoice-document' as const;

/** Как собирать счета в PDF. */
export interface InvoicePdfBuildOptions {
    /** Год папки хранилища и публичных ссылок, четыре цифры. */
    year: string;
    /** `settings.withStamps` запроса: печать и подписи */
    withStamps: boolean;
    /** Код стиля счёта; не задан — стиль по умолчанию */
    styleCode?: string | null;
    /**
     * Сколько счетов этой генерации уже выпущено прежними вызовами: сквозной
     * сдвиг номера (первый счёт N, следующие N-1, N-2…).
     */
    numberOffset?: number;
}

export interface InvoicePdfBuildResult {
    /** Готовые документы счетов, по одному на набор. Пусто, когда счёт не построен. */
    documents: IPreparedDocument[];
    /** Заполнено, когда счёт не построен: причина для менеджера. */
    notBuiltReason?: string;
}

/**
 * Счета PDF-КП без Word: модель счёта (`InvoicePdfModelService`) рисуется
 * сразу в PDF (`InvoicePdfRenderService`), без шаблона DOCX и LibreOffice.
 * Файл кладётся в публичное хранилище с публичной ссылкой, как Word-счёт, имя
 * счёта в списке и имя на Диске считаются теми же функциями.
 *
 * Тот же вид результата, что у `InvoiceDocumentsBuildService` Word-потока:
 * дальше документы идут на Диск Битрикса и в таймлайн без изменений.
 */
@Injectable()
export class InvoicePdfBuildService {
    constructor(
        private readonly models: InvoicePdfModelService,
        private readonly renderer: InvoicePdfRenderService,
        private readonly storage: StorageService,
        private readonly fileLink: FileLinkService,
        private readonly config: ConfigService,
    ) {}

    async build(
        dto: InvoiceBuildRequest,
        options: InvoicePdfBuildOptions,
    ): Promise<InvoicePdfBuildResult> {
        const { items, notBuiltReason } = await this.models.build(dto, {
            withStamps: options.withStamps,
            styleCode: options.styleCode,
            numberOffset: options.numberOffset,
        });
        // react-pdf тяжёлый, а машина общая: счета рисуются по одному
        const documents: IPreparedDocument[] = [];
        for (const item of items) {
            documents.push(
                await this.buildOne(dto, item, options, documents.length),
            );
        }
        return {
            documents,
            ...(notBuiltReason ? { notBuiltReason } : {}),
        };
    }

    private async buildOne(
        dto: InvoiceBuildRequest,
        { model, setKind, setIndex }: InvoicePdfModelItem,
        { year }: InvoicePdfBuildOptions,
        position: number,
    ): Promise<IPreparedDocument> {
        const { buffer } = await this.renderer.render(model);
        const fileName = `invoice-${randomUUID()}.pdf`;
        const absolutePath = await this.storage.saveFile(
            buffer,
            fileName,
            StorageType.PUBLIC,
            `konstructor/${RESULT_SUB_DIR}/${year}/${dto.domain}/${dto.userId}`,
        );
        const rootLink = await this.fileLink.createPublicLink(
            dto.domain,
            Number(dto.userId),
            'konstructor',
            RESULT_SUB_DIR,
            year,
            fileName,
        );
        const baseUrl = this.config.get<string>('APP_URL', '');
        return {
            link: `${baseUrl}${rootLink}`,
            // имя — по набору, из которого собран счёт
            name: getInvoiceDocumentProductName(
                dto,
                setKind,
                setIndex,
                position,
            ),
            type: 'invoice',
            // на Диске счёт называется по номеру, нет номера — по комплекту
            diskName: getInvoiceDiskName(
                dto,
                setKind,
                setIndex,
                model.data.InvoiceNumber,
                position,
            ),
            absolutePath,
        };
    }
}
