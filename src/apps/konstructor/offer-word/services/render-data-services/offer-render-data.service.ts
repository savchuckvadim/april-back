import { OfferWordByTemplateGenerateDto } from '../../dto/offer-word-generate-request.dto';
import { Injectable } from '@nestjs/common';
import { ProviderService } from '@/modules/portal-konstructor/provider';

import {
    IInfoblocksRenderData,
    OfferRenderInfoblocksService,
} from './offer-render-infoblocks.service';
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
    IOfferRenderManagerData,
    OfferRenderManagerService,
} from './offer-render-manager.service';
import {
    IGeneralProductRenderItemData,
    OfferRenderGeneralProductService,
} from './offer-render-general-product.service';

type IOfferWordRenderData = IInfoblocksRenderData &
    IProductRenderData &
    IProviderRqRenderData &
    IOfferRenderRecipientData &
    IOfferRenderManagerData &
    IGeneralProductRenderItemData &
    Partial<ITotalRowRenderData>;

@Injectable()
export class OfferRenderDataService {
    constructor(
        private readonly providerService: ProviderService,
        private readonly offerRenderInfoblocksService: OfferRenderInfoblocksService,
        private readonly offerRenderPriceService: OfferRenderPriceService,
        private readonly offerRenderGeneralProductService: OfferRenderGeneralProductService,
        private readonly offerRenderProviderRqService: OfferRenderProviderRqService,
        private readonly offerRenderRecipientService: OfferRenderRecipientService,
        private readonly offerRenderManagerService: OfferRenderManagerService,
    ) {}

    public async getOfferRenderData(
        dto: OfferWordByTemplateGenerateDto,
    ): Promise<IOfferWordRenderData> {
        const withTotal = this.getWithTotalFlag(dto);

        const provider = await this.providerService.findById(
            Number(dto.providerId),
        );

        const providerRq = this.offerRenderProviderRqService.renderProviderRq(
            provider ?? null,
        );

        const infoblocks = await this.renderDoumentInfoblocks(dto);
        const productPrices = this.offerRenderPriceService.renderProductPrices(
            dto.rows,
            dto.contract,
            dto.clientType,
        );
        const generalProduct =
            this.offerRenderGeneralProductService.renderTotalPrice(
                dto.total,
                dto.contract.aprilName || dto.contract.bitrixName,
                dto.contract.prepayment,
                dto.clientType,
                provider?.withTax || false,
            );
        const recipient = this.offerRenderRecipientService.getData(
            dto.recipient,
        );
        const manager = this.offerRenderManagerService.getData(dto.manager);
        let totalPrice: ITotalRowRenderData | null = null;
        if (withTotal) {
            totalPrice = this.offerRenderPriceService.renderTotalPrice(
                dto.total,
                dto.clientType,
                provider?.withTax || false,
            );
        }
        const renderData = this.createRenderData(
            providerRq,
            infoblocks,
            productPrices,
            generalProduct,
            recipient,
            manager,
            totalPrice,
        );

        return renderData;
    }

    private createRenderData(
        providerRq: IProviderRqRenderData,
        infoblocks: IInfoblocksRenderData,
        productPrices: IProductRenderData,
        generalProduct: IGeneralProductRenderItemData,
        recipient: IOfferRenderRecipientData,
        manager: IOfferRenderManagerData,
        totalPrice: ITotalRowRenderData | null,
    ): IOfferWordRenderData {
        return {
            ...providerRq,
            ...infoblocks,
            ...productPrices,
            ...generalProduct,
            ...recipient,
            ...manager,
            ...(totalPrice ?? {}),
        };
    }

    private async renderDoumentInfoblocks(
        dto: OfferWordByTemplateGenerateDto,
    ): Promise<IInfoblocksRenderData> {
        return await this.offerRenderInfoblocksService.renderInfoblocks(dto);
    }

    private getWithTotalFlag(dto: OfferWordByTemplateGenerateDto): boolean {
        const withAlternative = dto.sets.alternative.length > 0;
        return !withAlternative;
    }
}
