import { Injectable, Logger } from '@nestjs/common';
import { ProviderImageService } from '@lib/portal-lib/konstructor';
import {
    ProviderService,
    RqEntity,
} from '@lib/portal-lib/konstructor/provider';
import { splitInvoiceRenderData } from '@app/konstructor/offer-word/lib/invoice-single-items.util';
import { InvoiceRenderDataService } from '@app/konstructor/offer-word/services/render-data-services/invoice-render-data.service';
import { InvoiceBuildRequest } from '@app/konstructor/offer-word/types/invoice-build-request.type';
import { InvoiceSetKind } from '@app/konstructor/offer-word/types/invoice-set.types';
import { readErrorText } from '../../lib/read-error-text.util';
import {
    buildInvoicePdfModel,
    invoiceImageRoles,
    type InvoiceImageContent,
} from '../lib/invoice-pdf-model.util';
import { InvoicePdfModel } from '../model/invoice-pdf.model';

/** Причина для менеджера, когда у поставщика нет реквизитов. */
export const INVOICE_PROVIDER_NOT_FOUND_REASON =
    'не найдены реквизиты поставщика';

/** Модель одного счёта и набор, из которого он собран. */
export interface InvoicePdfModelItem {
    model: InvoicePdfModel;
    setKind: InvoiceSetKind;
    setIndex: number;
}

export interface InvoicePdfModelResult {
    /** По модели на набор; пусто, когда счёт не построен */
    items: InvoicePdfModelItem[];
    /** Заполнено, когда счёт не построен: причина для менеджера */
    notBuiltReason?: string;
}

export interface InvoicePdfModelOptions {
    /** `settings.withStamps` запроса: печать, подписи руководителя и бухгалтера */
    withStamps: boolean;
    /** Код стиля счёта; не задан — стиль по умолчанию */
    styleCode?: string | null;
    /** Сколько счетов этой генерации уже выпущено: сдвиг номера счёта */
    numberOffset?: number;
}

/**
 * Модели счетов для PDF: данные счёта берёт тот же сервис, что даёт их
 * Word-шаблону (`InvoiceRenderDataService`: реквизиты, получатель, строки,
 * итоги, номер), поверх них идут подписант и картинки поставщика. Суммы здесь
 * не считаются, а делятся на счета по наборам тем же шагом, что у Word-счёта
 * (`splitInvoiceRenderData`).
 */
@Injectable()
export class InvoicePdfModelService {
    private readonly logger = new Logger(InvoicePdfModelService.name);

    constructor(
        private readonly renderData: InvoiceRenderDataService,
        private readonly providers: ProviderService,
        private readonly providerImages: ProviderImageService,
    ) {}

    async build(
        dto: InvoiceBuildRequest,
        options: InvoicePdfModelOptions,
    ): Promise<InvoicePdfModelResult> {
        const rq = await this.providers.findById(Number(dto.providerId));
        if (!rq) {
            return {
                items: [],
                notBuiltReason: INVOICE_PROVIDER_NOT_FOUND_REASON,
            };
        }
        const [renderData, contents] = await Promise.all([
            this.renderData.getInvoiceRenderData(dto),
            this.imageContents(rq, options.withStamps),
        ]);
        const items = splitInvoiceRenderData(
            renderData,
            options.numberOffset ?? 0,
        ).map(({ data, setKind, setIndex }) => ({
            model: buildInvoicePdfModel({
                data,
                rq,
                contents,
                withStamps: options.withStamps,
                styleCode: options.styleCode,
            }),
            setKind,
            setIndex,
        }));
        return { items };
    }

    /**
     * Картинки реквизитов по ролям счёта. Сбой чтения (нет таблицы до
     * миграции, база недоступна) счёт не роняет: одна строка в лог и счёт без
     * картинок.
     */
    private async imageContents(
        rq: RqEntity,
        withStamps: boolean,
    ): Promise<InvoiceImageContent[]> {
        try {
            return await this.providerImages.loadContents(
                rq.id,
                invoiceImageRoles(withStamps),
            );
        } catch (error: unknown) {
            this.logger.warn(
                `Картинки поставщика (реквизиты ${rq.id}) для счёта не прочитаны: ${readErrorText(error)}`,
            );
            return [];
        }
    }
}
