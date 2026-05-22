import { OfferWordByTemplateGenerateDto } from '../../dto/offer-word-generate-request.dto';
import { Injectable } from '@nestjs/common';
import { ProviderService } from '@/modules/portal-konstructor/provider';

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
} from '@/apps/konstructor/document-generate';
import { ContractDto } from '@/apps/konstructor/dto/contract.dto';
import { ClientTypeEnum } from '@/apps/konstructor/document-generate/type/client.type';
import dayjs from 'dayjs';

type IInvoicePriceData = {
    rows: IProductRenderData;
    total: ITotalRowRenderData;
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
        dto: OfferWordByTemplateGenerateDto,
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

        const invoicePrices: IInvoicePriceData[] = this.getInvoicePrices(
            dto,
            provider?.withTax || false,
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
        dto: OfferWordByTemplateGenerateDto,
    ): IInvoiceRenderGeneralData {
        const nowDate = dayjs().format('D MMMM YYYY [г.]');
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
        dto: OfferWordByTemplateGenerateDto,
        withTax: boolean,
    ): IInvoicePriceData[] {
        const isMultipleInvoice = this.getIsMultipleInvoice(dto);
        const needGeneral = dto.invoice.needGeneralInvoice;
        const prices: IInvoicePriceData[] = [];

        if (needGeneral) {
            const generals = this.getSetGroupRows(
                dto.sets.general,
                dto.contract,
                dto.clientType,
                withTax,
            );
            prices.push(...generals);
        }
        if (isMultipleInvoice) {
            const alternatives = this.getSetGroupRows(
                dto.sets.alternative,
                dto.contract,
                dto.clientType,
                withTax,
            );
            prices.push(...alternatives);
        }

        return prices;
    }

    private getSetGroupRows(
        rowGroup: ProductRowSetDto[], // general or alternative
        contract: ContractDto,
        clientType: ClientTypeEnum,
        withTax: boolean = false,
    ): IInvoicePriceData[] {
        const prices: IInvoicePriceData[] = [];
        rowGroup.forEach(general => {
            const rows = this.getRowsFromSetItemRow(general.rows);
            prices.push({
                rows: this.offerRenderPriceService.renderProductPrices(
                    rows,
                    contract,
                    clientType,
                ),
                total: this.offerRenderPriceService.renderTotalPrice(
                    general.total[0],
                    clientType,
                    withTax || false,
                ),
            });
        });
        return prices;
    }
    private getRowsFromSetItemRow(
        setItemRow: ProductRowSetItemDto,
    ): ProductRowDto[] {
        const rows: ProductRowDto[] = [];
        Object.values(setItemRow).forEach((row: ProductRowDto[]) => {
            row.forEach(r => {
                rows.push(r);
            });
        });
        return rows;
    }

    private getIsMultipleInvoice(dto: OfferWordByTemplateGenerateDto): boolean {
        const withAlternative =
            dto.invoice.needManyInvoices && dto.sets.alternative.length > 0;
        return withAlternative;
    }
}
