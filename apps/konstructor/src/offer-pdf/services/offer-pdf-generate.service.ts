import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
import { StorageService, StorageType } from '@lib/core/storage/storage.service';
import { SupplyPayloadEnricherService } from '@app/konstructor/document-generate/supply/supply-payload-enricher.service';
import { ComplectVariantOfferStageService } from '@app/konstructor/modules/complect-variant-lifecycle/services/complect-variant-offer-stage.service';
import { IPreparedDocument } from '@app/konstructor/offer-word/interface/document.interface';
import { getOfferDocumentProductName } from '@app/konstructor/offer-word/lib/get-offer-document-product-name.util';
import { BitrixDocumentSaveFlowService } from '@app/konstructor/offer-word/services/bitrix/bitrix-document-save-flow.service';
import { OfferBxTimelineService } from '@app/konstructor/offer-word/services/bitrix/offer-bx-timeline.service';
import { PdfMergeService } from '@app/konstructor/offer-word/services/pdf-export/pdf-merge.service';
import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
import {
    OfferPdfPrintPlan,
    OfferPdfPrintUnit,
    planOfferPdfPrint,
} from '../lib/offer-pdf-print-plan';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfDocumentModelService } from './offer-pdf-document-model.service';
import {
    OfferPdfRenderResult,
    OfferPdfRenderService,
} from './offer-pdf-render.service';

/** Итог прикрепления к сделке Битрикса */
export interface OfferPdfDealResult {
    /** Все файлы загружены на Диск Битрикса и упомянуты в таймлайне сделки */
    savedToDeal: boolean;
    /** Ссылка на первый файл в Битриксе — когда загрузка удалась */
    bitrixLink: string | null;
    /** Почему к сделке не прикрепили — текст для пользователя */
    dealMessage: string | null;
}

/** Один готовый файл генерации: вариант, склейка вариантов или единственное КП. */
export interface OfferPdfGeneratedFile {
    /** Публичная ссылка на PDF на нашем сервере */
    link: string;
    fileName: string;
    /** Имя документа, как в Битриксе: «КП <комплект> - <поставка>» */
    name: string;
    /** Размер файла в байтах */
    size: number;
    /** Ссылка на файл в Битриксе; null — на Диск он не попал */
    bitrixLink: string | null;
}

export interface OfferPdfGenerateResult extends OfferPdfDealResult {
    /** Публичная ссылка на PDF на нашем сервере — первый файл из `links` */
    link: string;
    fileName: string;
    templateCode: OfferPdfTemplateCode;
    /** Время рендера всех документов в миллисекундах */
    durationMs: number;
    /** Размер первого файла в байтах */
    size: number;
    /** Файлы оформления стиля, которых нет на сервере: документ собран без них */
    missingAssets: string[];
    /** Все файлы: один, либо по файлу на вариант при separateDocuments и сбое склейки */
    links?: OfferPdfGeneratedFile[];
    /** Что не сошлось при слиянии вариантов и почему файлы не склеены */
    warnings?: string[];
}

/** Что отдаёт предпросмотр: один PDF со всем, что будет напечатано. */
export type OfferPdfPreviewResult = Pick<
    OfferPdfRenderResult,
    'buffer' | 'durationMs' | 'templateCode' | 'missingAssets'
>;

interface PrintedDocument {
    unit: OfferPdfPrintUnit;
    rendered: OfferPdfRenderResult;
}

/** Файл к записи: итоговый PDF и имя документа для Битрикса. */
interface PdfFile {
    buffer: Buffer;
    name: string;
}

interface SavedPdf {
    absolutePath: string;
    fileName: string;
    link: string;
    name: string;
    size: number;
}

interface DealAttachment {
    deal: OfferPdfDealResult;
    /** Ссылка в Битриксе для каждого файла по порядку; null — файл не загрузился */
    bitrixLinks: Array<string | null>;
}

/**
 * Подкаталог публичного хранилища и ссылок (/api/files/<token>):
 * konstructor/offer/<год>/<домен>/<пользователь>/offer-<uuid>.pdf
 */
const RESULT_SUB_DIR = 'offer' as const;

const MERGE_FAILED_WARNING =
    'PDF вариантов не склеились: файлы отданы по одному';

/**
 * Предпросмотр — только буфер. Генерация — файлы в хранилище + ссылки,
 * затем (если не отключено) Диск Битрикса и таймлайн сделки — теми же
 * сервисами, что и Word-поток. Сбой Битрикса документ не отменяет:
 * ссылка на сервер отдаётся всегда, причина — в dealMessage.
 *
 * Варианты комплекта печатаются так же, как у Word-КП: режим определяет
 * resolveDocumentVariants, что и сколько печатать — planOfferPdfPrint.
 * В режиме independent на каждый вариант свой PDF; предпросмотр показывает
 * их склейкой, генерация склеивает (PdfMergeService) или, при
 * separateDocuments и сбое склейки, отдаёт файлы по одному.
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
        private readonly supplyEnricher: SupplyPayloadEnricherService,
        private readonly pdfMerge: PdfMergeService,
        private readonly variantStage: ComplectVariantOfferStageService,
    ) {}

    /**
     * Один PDF со всем, что будет напечатано: у independent это склейка
     * вариантов, в том числе при separateDocuments.
     */
    async preview(dto: OfferPdfGenerateDto): Promise<OfferPdfPreviewResult> {
        const { documents } = await this.renderDocuments(dto);
        const [first] = documents;
        if (documents.length === 1) {
            return first.rendered;
        }
        const buffer = await this.pdfMerge.mergeBuffers(
            documents.map(document => document.rendered.buffer),
        );
        return {
            buffer,
            durationMs: this.totalDuration(documents),
            templateCode: first.rendered.templateCode,
            missingAssets: this.missingAssets(documents),
        };
    }

    async generate(dto: OfferPdfGenerateDto): Promise<OfferPdfGenerateResult> {
        const { plan, documents } = await this.renderDocuments(dto);
        const warnings = [...plan.warnings];
        const files = await this.composeFiles(dto, plan, documents, warnings);

        const saved: SavedPdf[] = [];
        for (const file of files) {
            saved.push(await this.saveToStorage(dto, file));
        }
        const { deal, bitrixLinks } =
            dto.saveToDeal === false
                ? this.notAttached(saved)
                : await this.attachToDeal(dto, saved);

        // файлы готовы: варианты КП получают стадию «КП» (предпросмотр её не ставит)
        await this.markVariantsOffer(dto);

        const [first] = saved;
        return {
            link: first.link,
            fileName: first.fileName,
            templateCode: documents[0].rendered.templateCode,
            durationMs: this.totalDuration(documents),
            size: first.size,
            missingAssets: this.missingAssets(documents),
            ...deal,
            links: saved.map((file, index) => ({
                link: file.link,
                fileName: file.fileName,
                name: file.name,
                size: file.size,
                bitrixLink: bitrixLinks[index] ?? null,
            })),
            warnings,
        };
    }

    /**
     * Стадия «КП» вариантам из запроса — тем же вызовом, что у Word-КП.
     * Best-effort: сбой стадий документ не отменяет, он уже сохранён.
     */
    private async markVariantsOffer(dto: OfferPdfGenerateDto): Promise<void> {
        try {
            await this.variantStage.markOffer(dto.domain, dto.variants);
        } catch (error) {
            this.logger.warn(
                `КП PDF (${dto.domain}): стадия КП вариантам не проставлена — ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Подписи поставок — с бэка по code, как в Word-потоке (легаси-тексты
     * сильнее): верх запроса и каждый вариант, одна память на запрос. Затем
     * план печати и рендер документов по одному: react-pdf тяжёлый, а машина
     * общая.
     */
    private async renderDocuments(
        dto: OfferPdfGenerateDto,
    ): Promise<{ plan: OfferPdfPrintPlan; documents: PrintedDocument[] }> {
        const prepared = await this.supplyEnricher.enrichWithVariants(dto);
        const plan = planOfferPdfPrint(prepared);

        const documents: PrintedDocument[] = [];
        for (const unit of plan.units) {
            const model = await this.modelService.build(unit.input, {
                variantTitle: unit.variantTitle,
            });
            documents.push({
                unit,
                rendered: await this.renderService.render(model),
            });
        }
        return { plan, documents };
    }

    /**
     * Из документов — файлы: один документ — один файл; варианты independent
     * склеиваются в один PDF, а при separateDocuments или сбое склейки идут
     * по файлу на вариант (документы не теряем).
     */
    private async composeFiles(
        dto: OfferPdfGenerateDto,
        plan: OfferPdfPrintPlan,
        documents: PrintedDocument[],
        warnings: string[],
    ): Promise<PdfFile[]> {
        const separate = documents.map(document => this.fileOf(document));
        if (documents.length === 1 || plan.separateDocuments) {
            return separate;
        }

        try {
            const buffer = await this.pdfMerge.mergeBuffers(
                documents.map(document => document.rendered.buffer),
            );
            return [{ buffer, name: separate[0].name }];
        } catch (error) {
            this.logger.warn(
                `КП PDF (${dto.domain}): склейка вариантов не удалась, отдаём по одному — ${error instanceof Error ? error.message : String(error)}`,
            );
            warnings.push(MERGE_FAILED_WARNING);
            return separate;
        }
    }

    private fileOf({ unit, rendered }: PrintedDocument): PdfFile {
        return {
            buffer: rendered.buffer,
            name: getOfferDocumentProductName(unit.input),
        };
    }

    private totalDuration(documents: PrintedDocument[]): number {
        return documents.reduce(
            (sum, document) => sum + document.rendered.durationMs,
            0,
        );
    }

    private missingAssets(documents: PrintedDocument[]): string[] {
        return [
            ...new Set(
                documents.flatMap(document => document.rendered.missingAssets),
            ),
        ];
    }

    private async saveToStorage(
        dto: OfferPdfGenerateDto,
        file: PdfFile,
    ): Promise<SavedPdf> {
        const year = dayjs().format('YYYY');
        const fileName = `offer-${randomUUID()}.pdf`;
        const absolutePath = await this.storage.saveFile(
            file.buffer,
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
            absolutePath,
            fileName,
            link: `${baseUrl}${rootLink}`,
            name: file.name,
            size: file.buffer.length,
        };
    }

    /** В Битрикс не ходили: ни ссылок, ни причины. */
    private notAttached(saved: SavedPdf[]): DealAttachment {
        return {
            deal: { savedToDeal: false, bitrixLink: null, dealMessage: null },
            bitrixLinks: saved.map(() => null),
        };
    }

    /**
     * Диск Битрикса + комментарий в таймлайн, все файлы одним обращением.
     * saveDocuments без onlyBitrixSave при сбое Диска сам подставляет
     * серверные ссылки — тогда bitrixLink пустой, а комментарий всё равно
     * уходит.
     */
    private async attachToDeal(
        dto: OfferPdfGenerateDto,
        saved: SavedPdf[],
    ): Promise<DealAttachment> {
        const documents: IPreparedDocument[] = saved.map(file => ({
            absolutePath: file.absolutePath,
            link: file.link,
            name: file.name,
            type: 'offer',
        }));
        const target = {
            domain: dto.domain,
            companyId: dto.companyId,
            userId: dto.userId,
            dealId: dto.dealId,
        };
        try {
            const result = await this.bxSaveFlow.saveDocuments({
                ...target,
                documents,
                onlyBitrixSave: false,
            });
            const bitrixLinks = saved.map((file, index) => {
                const uploaded = result.documents[index];
                return uploaded && uploaded.link !== file.link
                    ? uploaded.link
                    : null;
            });
            await this.timeline.sendDocumentToBitrix({
                ...target,
                documents: result.documents,
            });
            const uploadedCount = bitrixLinks.filter(Boolean).length;
            return {
                deal: {
                    savedToDeal: uploadedCount === saved.length,
                    bitrixLink: bitrixLinks[0],
                    dealMessage: this.uploadMessage(
                        uploadedCount,
                        saved.length,
                    ),
                },
                bitrixLinks,
            };
        } catch (error) {
            const reason =
                error instanceof Error ? error.message : 'ошибка Битрикса';
            this.logger.warn(
                `КП PDF: не удалось прикрепить к сделке ${dto.dealId} (${dto.domain}) — ${reason}`,
            );
            return {
                deal: {
                    savedToDeal: false,
                    bitrixLink: null,
                    dealMessage: `Не удалось прикрепить файл к сделке: ${reason}`,
                },
                bitrixLinks: saved.map(() => null),
            };
        }
    }

    /** Почему не все файлы попали на Диск; null — все на месте. */
    private uploadMessage(uploaded: number, total: number): string | null {
        if (uploaded === total) return null;
        if (total === 1) {
            return 'Файл не загрузился на Диск Битрикса — в сделку ушла ссылка на сервер';
        }
        return `На Диск Битрикса загрузились ${uploaded} из ${total} файлов — для остальных в сделку ушли ссылки на сервер`;
    }
}
