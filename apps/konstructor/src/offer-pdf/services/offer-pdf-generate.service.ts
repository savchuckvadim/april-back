import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import { basename } from 'path';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
import { StorageService, StorageType } from '@lib/core/storage/storage.service';
import { SALES_DOCUMENT_KIND } from '@lib/queue/constants/sales-document-event-job';
import type { SalesDocumentKind } from '@lib/queue/constants/sales-document-event-job';
import { SupplyPayloadEnricherService } from '@app/konstructor/document-generate/supply/supply-payload-enricher.service';
import { ComplectVariantOfferStageService } from '@app/konstructor/modules/complect-variant-lifecycle/services/complect-variant-offer-stage.service';
import { SalesDocumentFlowService } from '@app/konstructor/modules/sales-document-flow/services/sales-document-flow.service';
import { IPreparedDocument } from '@app/konstructor/offer-word/interface/document.interface';
import { getOfferDocumentProductName } from '@app/konstructor/offer-word/lib/get-offer-document-product-name.util';
import {
    describeInvoiceNotBuilt,
    getErrorReason,
} from '@app/konstructor/offer-word/lib/invoice-not-built.util';
import { resolveDocumentVariants } from '@app/konstructor/offer-word/multi/lib/variants/resolve-document-variants';
import { withVariant } from '@app/konstructor/offer-word/multi/lib/variants/with-variant';
import { BitrixDocumentSaveFlowService } from '@app/konstructor/offer-word/services/bitrix/bitrix-document-save-flow.service';
import { OfferBxTimelineService } from '@app/konstructor/offer-word/services/bitrix/offer-bx-timeline.service';
import { InvoiceDocumentsBuildService } from '@app/konstructor/offer-word/services/invoice-word-core/invoice-documents-build.service';
import { PdfMergeService } from '@app/konstructor/offer-word/services/pdf-export/pdf-merge.service';
import { InvoiceBuildRequest } from '@app/konstructor/offer-word/types/invoice-build-request.type';
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
    /** Все файлы (КП и счета) загружены на Диск Битрикса и упомянуты в таймлайне сделки */
    savedToDeal: boolean;
    /** Ссылка на первый файл КП в Битриксе — когда загрузка удалась */
    bitrixLink: string | null;
    /** Почему к сделке не прикрепили — текст для пользователя */
    dealMessage: string | null;
}

/**
 * Один готовый файл генерации: вариант, склейка вариантов или единственное КП;
 * та же форма у файла счёта.
 */
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
    /**
     * Счета в PDF (при сбое перевода — в DOCX), по одному на набор. Пусто, когда
     * счёт не запрашивали или не удалось собрать: причина — в warnings.
     */
    invoiceLinks: OfferPdfGeneratedFile[];
    /**
     * Что не сошлось при слиянии вариантов, почему файлы не склеены и почему не
     * собран счёт («Счёт не сформирован: <причина>»)
     */
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
    /**
     * Файлы записаны в сделку: загрузка на Диск и комментарий в таймлайн
     * прошли без исключения (при сбое Диска в таймлайне серверные ссылки).
     */
    attached: boolean;
    deal: OfferPdfDealResult;
    /** Ссылка в Битриксе для каждого файла КП по порядку; null — файл не загрузился */
    bitrixLinks: Array<string | null>;
    /** То же для каждого счёта по порядку */
    invoiceBitrixLinks: Array<string | null>;
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
 * Счёт (generate, если в запросе есть invoice с нужным флагом) собирает
 * тот же сервис и тот же шаблон счёта, что у Word-КП: шаблон подбирается
 * по порталу, поставщику, типу клиента и виду поставки, DOCX переводится
 * в PDF (сбой перевода оставляет DOCX). Счета идут по открытому варианту
 * запроса, как у Word-КП без разбивки по договорам. Они уходят в сделку тем
 * же обращением, что КП, с типом invoice, и в тот же комментарий таймлайна.
 * Сбой счёта КП никогда не отменяет: причина попадает в warnings.
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
        private readonly invoiceDocuments: InvoiceDocumentsBuildService,
        private readonly salesDocumentFlow: SalesDocumentFlowService,
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
        const { prepared, plan, documents } = await this.renderDocuments(dto);
        const warnings = [...plan.warnings];
        const files = await this.composeFiles(dto, plan, documents, warnings);

        const saved: SavedPdf[] = [];
        for (const file of files) {
            saved.push(await this.saveToStorage(dto, file));
        }
        // счёт — дополнение к КП: что бы с ним ни случилось, КП уже сохранено
        const invoices = await this.buildInvoices(prepared, warnings);
        const { attached, deal, bitrixLinks, invoiceBitrixLinks } =
            dto.saveToDeal === false
                ? this.notAttached(saved, invoices)
                : await this.attachToDeal(dto, saved, invoices);

        // документ в сделке: сообщаем о нём потоку продаж (без `salesFlow` и
        // без записи в сделку, например при saveToDeal: false, ничего не уходит)
        if (attached) {
            await this.publishSalesFlow(dto, plan, invoices.length > 0);
        }

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
            invoiceLinks: await this.invoiceLinksOf(
                invoices,
                invoiceBitrixLinks,
            ),
            warnings,
        };
    }

    /**
     * КП и счёт в поток продаж: только по `salesFlow` из запроса и только для
     * документов, записанных в сделку. Печатаемые документы берутся из плана
     * печати, по которому собраны файлы.
     */
    private async publishSalesFlow(
        dto: OfferPdfGenerateDto,
        plan: OfferPdfPrintPlan,
        withInvoice: boolean,
    ): Promise<void> {
        if (dto.salesFlow !== true) return;
        const kinds: SalesDocumentKind[] = [SALES_DOCUMENT_KIND.offer];
        if (withInvoice) kinds.push(SALES_DOCUMENT_KIND.invoice);
        await this.salesDocumentFlow.publish({
            salesFlow: dto.salesFlow,
            domain: dto.domain,
            userId: dto.userId,
            companyId: dto.companyId,
            dealId: dto.dealId,
            kinds,
            presentation: dto.presentation,
            sources: plan.units.map(unit => unit.input),
        });
    }

    /**
     * Счета КП: тот же сервис и шаблон счёта, что у Word-КП, перевод в PDF.
     * Счёта нет в запросе, флаги выключены — пусто. Любой сбой не бросается:
     * причина уходит в warnings, КП остаётся.
     */
    private async buildInvoices(
        prepared: OfferPdfGenerateDto,
        warnings: string[],
    ): Promise<IPreparedDocument[]> {
        const invoice = prepared.invoice;
        if (!invoice?.needGeneralInvoice && !invoice?.needManyInvoices) {
            return [];
        }

        try {
            const result = await this.invoiceDocuments.build(
                this.invoiceRequestOf(prepared, invoice),
                { year: dayjs().format('YYYY'), isPdf: true },
            );
            if (result.notBuiltReason) {
                this.addWarning(
                    warnings,
                    describeInvoiceNotBuilt(result.notBuiltReason),
                );
            }
            return result.documents;
        } catch (error) {
            const reason = getErrorReason(error);
            this.logger.error(
                `КП PDF (${prepared.domain}): счета не собрались — ${reason}`,
            );
            this.addWarning(warnings, describeInvoiceNotBuilt(reason));
            return [];
        }
    }

    /**
     * Запрос на счёт по открытому (первому) варианту. Домен, поставщик, тип
     * клиента и поставка идут в подбор шаблона счёта так же, как у Word-КП:
     * у разных поставщиков и типов клиента (юрлицо, физлицо, ИП, бюджет)
     * разные формы счёта.
     */
    private invoiceRequestOf(
        prepared: OfferPdfGenerateDto,
        invoice: NonNullable<OfferPdfGenerateDto['invoice']>,
    ): InvoiceBuildRequest {
        const open = withVariant(
            prepared,
            resolveDocumentVariants(prepared).variants[0],
        );
        return {
            domain: open.domain,
            userId: open.userId,
            providerId: open.providerId,
            clientType: open.clientType,
            invoiceTemplateId: open.invoiceTemplateId,
            supply: open.supply,
            recipient: open.recipient,
            contractType: open.contractType,
            contract: open.contract,
            sets: open.sets,
            invoice,
        };
    }

    /** Одно предупреждение — одной строкой, сколько бы раз оно ни возникло. */
    private addWarning(warnings: string[], warning: string): void {
        if (!warnings.includes(warning)) {
            warnings.push(warning);
        }
    }

    /** Ответ по счетам: та же форма, что у файлов КП. */
    private async invoiceLinksOf(
        invoices: IPreparedDocument[],
        bitrixLinks: Array<string | null>,
    ): Promise<OfferPdfGeneratedFile[]> {
        const links: OfferPdfGeneratedFile[] = [];
        for (const [index, invoice] of invoices.entries()) {
            links.push({
                link: invoice.link,
                fileName: basename(invoice.absolutePath),
                name: invoice.name,
                size: await this.fileSize(invoice.absolutePath),
                bitrixLink: bitrixLinks[index] ?? null,
            });
        }
        return links;
    }

    /** Размер файла в хранилище; не прочитался — 0, ответ из-за этого не падает. */
    private async fileSize(absolutePath: string): Promise<number> {
        try {
            return (await this.storage.readFile(absolutePath)).length;
        } catch (error) {
            this.logger.warn(
                `КП PDF: размер файла ${basename(absolutePath)} не определён — ${getErrorReason(error)}`,
            );
            return 0;
        }
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
    private async renderDocuments(dto: OfferPdfGenerateDto): Promise<{
        prepared: OfferPdfGenerateDto;
        plan: OfferPdfPrintPlan;
        documents: PrintedDocument[];
    }> {
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
        return { prepared, plan, documents };
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
    private notAttached(
        saved: SavedPdf[],
        invoices: IPreparedDocument[],
    ): DealAttachment {
        return {
            attached: false,
            deal: { savedToDeal: false, bitrixLink: null, dealMessage: null },
            bitrixLinks: saved.map(() => null),
            invoiceBitrixLinks: invoices.map(() => null),
        };
    }

    /**
     * Диск Битрикса + комментарий в таймлайн, все файлы (КП и счета) одним
     * обращением: КП с типом offer, счета с типом invoice. Ссылки на счета
     * идут в тот же комментарий таймлайна.
     * saveDocuments без onlyBitrixSave при сбое Диска сам подставляет
     * серверные ссылки — тогда bitrixLink пустой, а комментарий всё равно
     * уходит.
     */
    private async attachToDeal(
        dto: OfferPdfGenerateDto,
        saved: SavedPdf[],
        invoices: IPreparedDocument[],
    ): Promise<DealAttachment> {
        const documents: IPreparedDocument[] = [
            ...saved.map(
                (file): IPreparedDocument => ({
                    absolutePath: file.absolutePath,
                    link: file.link,
                    name: file.name,
                    type: 'offer',
                }),
            ),
            ...invoices.map(
                (invoice): IPreparedDocument => ({
                    absolutePath: invoice.absolutePath,
                    link: invoice.link,
                    name: invoice.name,
                    type: 'invoice',
                }),
            ),
        ];
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
            const allBitrixLinks = documents.map((file, index) => {
                const uploaded = result.documents[index];
                return uploaded && uploaded.link !== file.link
                    ? uploaded.link
                    : null;
            });
            await this.timeline.sendDocumentToBitrix({
                ...target,
                documents: result.documents,
            });
            const uploadedCount = allBitrixLinks.filter(Boolean).length;
            return {
                attached: true,
                deal: {
                    savedToDeal: uploadedCount === documents.length,
                    bitrixLink: allBitrixLinks[0],
                    dealMessage: this.uploadMessage(
                        uploadedCount,
                        documents.length,
                    ),
                },
                bitrixLinks: allBitrixLinks.slice(0, saved.length),
                invoiceBitrixLinks: allBitrixLinks.slice(saved.length),
            };
        } catch (error) {
            const reason =
                error instanceof Error ? error.message : 'ошибка Битрикса';
            this.logger.warn(
                `КП PDF: не удалось прикрепить к сделке ${dto.dealId} (${dto.domain}) — ${reason}`,
            );
            return {
                attached: false,
                deal: {
                    savedToDeal: false,
                    bitrixLink: null,
                    dealMessage: `Не удалось прикрепить файл к сделке: ${reason}`,
                },
                bitrixLinks: saved.map(() => null),
                invoiceBitrixLinks: invoices.map(() => null),
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
