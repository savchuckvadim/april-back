import { InvoiceBuildRequest } from '../../types/invoice-build-request.type';
import { Injectable } from '@nestjs/common';
import { ProviderService } from '@lib/portal-lib/konstructor/provider';

import {
    IProductRenderData,
    ITotalRowRenderData,
    OfferRenderPriceService,
} from './offer-render-price.service';
import {
    IProviderRqRenderData,
    OfferRenderProviderRqService,
} from './offer-render-provider-rq.service';
import {
    IOfferRenderRecipientData,
    OfferRenderRecipientService,
} from './offer-render-recipient.service';
import {
    ProductRowDto,
    ProductRowSetDto,
    ProductRowSetItemDto,
} from '@app/konstructor/document-generate';
import { ContractDto } from '@app/konstructor/dto/contract.dto';
import { formatRu } from '@lib/shared/lib/date/format-ru';
import dayjs from 'dayjs';
import { getWithTax } from '@app/konstructor/document-generate/lib/get-with-tax.util';
import { collectSetRows } from '../../lib/collect-set-rows.util';
import { InvoiceSetKind } from '../../types/invoice-set.types';

export type IInvoicePriceData = {
    rows: IProductRenderData;
    total: ITotalRowRenderData;
    /** Набор, из которого собран счёт: вид и индекс в `sets.general`/`sets.alternative`. */
    setKind: InvoiceSetKind;
    setIndex: number;
};
export type IInvoiceRenderData = IOfferRenderRecipientData &
    IInvoiceRenderGeneralData &
    IProviderRqRenderData & {
        prices: IInvoicePriceData[];
    };

export type IInvoiceRenderGeneralData = {
    InvoiceNumber: string;
    InvoiceDate: string;
    InvoicePaymentDate: string;
};
export type IInvoiceSingleItemRenderData = IOfferRenderRecipientData &
    IProviderRqRenderData &
    IProductRenderData &
    ITotalRowRenderData &
    IInvoiceRenderGeneralData;

@Injectable()
export class InvoiceRenderDataService {
    constructor(
        private readonly providerService: ProviderService,
        private readonly offerRenderPriceService: OfferRenderPriceService,
        private readonly offerRenderProviderRqService: OfferRenderProviderRqService,
        private readonly offerRenderRecipientService: OfferRenderRecipientService,
    ) {}

    public async getInvoiceRenderData(
        dto: InvoiceBuildRequest,
    ): Promise<IInvoiceRenderData> {
        const provider = await this.providerService.findById(
            Number(dto.providerId),
        );

        const providerRq = this.offerRenderProviderRqService.renderProviderRq(
            provider ?? null,
        );

        const recipient = this.offerRenderRecipientService.getData(
            dto.recipient,
        );

        const withTax = getWithTax(provider, dto.contractType);

        const invoicePrices: IInvoicePriceData[] = this.getInvoicePrices(
            dto,
            withTax,
        );
        const invoiceGeneralData = this.getInvoiceGeneralData(dto);
        const renderData: IInvoiceRenderData = this.createRenderData(
            providerRq,
            recipient,
            invoicePrices,
            invoiceGeneralData,
        );

        return renderData;
    }

    private getInvoiceGeneralData(
        dto: InvoiceBuildRequest,
    ): IInvoiceRenderGeneralData {
        const nowDate = formatRu(dayjs(), 'D MMMM YYYY [г.]');
        const rawInvoicePaymentDate = dto.invoice.invoiceDate || '';
        return {
            InvoiceNumber: dto.invoice.invoiceNumber ?? '',
            InvoiceDate: nowDate,
            InvoicePaymentDate: this.getInvoicePaymentDate(
                rawInvoicePaymentDate,
            ),
        };
    }
    private getInvoicePaymentDate(invoiceDate: string): string {
        if (!invoiceDate) {
            return '';
        }
        const invoicePaymentDate = new Date(invoiceDate);
        const invoicePaymentFormattedDate =
            invoicePaymentDate.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            });
        return invoicePaymentFormattedDate;
    }

    private createRenderData(
        providerRq: IProviderRqRenderData,
        recipient: IOfferRenderRecipientData,
        invoicePrices: IInvoicePriceData[],
        invoiceGeneralData: IInvoiceRenderGeneralData,
    ): IInvoiceRenderData {
        return {
            ...providerRq,
            ...recipient,
            ...invoiceGeneralData,
            prices: invoicePrices,
        };
    }

    private getInvoicePrices(
        dto: InvoiceBuildRequest,
        withTax: boolean,
    ): IInvoicePriceData[] {
        const isMultipleInvoice = this.getIsMultipleInvoice(dto);
        const needGeneral = dto.invoice.needGeneralInvoice;
        const prices: IInvoicePriceData[] = [];

        if (needGeneral) {
            const generals = this.getSetGroupRows(
                dto.sets.general,
                'general',
                dto.contract,
                withTax,
            );
            prices.push(...generals);
        }
        if (isMultipleInvoice) {
            const alternatives = this.getSetGroupRows(
                dto.sets.alternative,
                'alternative',
                dto.contract,
                withTax,
            );
            prices.push(...alternatives);
        }

        return prices;
    }

    private getSetGroupRows(
        rowGroup: ProductRowSetDto[],
        setKind: InvoiceSetKind,
        contract: ContractDto,
        withTax: boolean = false,
    ): IInvoicePriceData[] {
        const prices: IInvoicePriceData[] = [];
        rowGroup.forEach((set, setIndex) => {
            const rows = this.getRowsFromSetItemRow(set.rows);
            prices.push({
                rows: this.offerRenderPriceService.renderProductPrices(
                    rows,
                    contract,
                ),
                // счёт как КП: бюджетнику на 4 месяца — на 4 месяца
                total: this.offerRenderPriceService.renderTotalPrice(
                    set.total[0],
                    withTax || false,
                ),
                setKind,
                setIndex,
            });
        });
        return prices;
    }
    private getRowsFromSetItemRow(
        setItemRow: ProductRowSetItemDto,
    ): ProductRowDto[] {
        return collectSetRows(setItemRow);
    }

    private getIsMultipleInvoice(dto: InvoiceBuildRequest): boolean {
        const withAlternative =
            dto.invoice.needManyInvoices && dto.sets.alternative.length > 0;
        return withAlternative;
    }
}
