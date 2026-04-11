import { Injectable } from '@nestjs/common';
import { IOfferWordGenerateRecipientDto } from '../../dto/offer-word-generate-request.dto';

export interface IOfferRenderRecipientData {
    RecipientName: string;
    RecipientPosition: string;
    RecipientNameCase: string;
    RecipientPositionCase: string;
    RecipientCompanyName: string;
    RecipientInn: string;
    RecipientInvoiceRq: string;
}

@Injectable()
export class OfferRenderRecipientService {
    constructor() {}

    public getData(
        dto: IOfferWordGenerateRecipientDto,
    ): IOfferRenderRecipientData {
        return {
            RecipientName: dto.name ?? '',
            RecipientPosition: dto.position ?? '',
            RecipientNameCase: dto.name ?? '',
            RecipientPositionCase: dto.position ?? '',
            RecipientCompanyName: dto.companyName ?? '',
            RecipientInn: dto.inn ?? '',
            RecipientInvoiceRq: this.getInvoiceRq(dto),
        };
    }
    protected getInvoiceRq(dto: IOfferWordGenerateRecipientDto): string {
        const space = '________________________________';
        let recipientInvoiceRq = '';
        if (dto.name) {
            recipientInvoiceRq += `${dto.name ?? ''}`;
        }
        if (dto.inn) {
            recipientInvoiceRq += recipientInvoiceRq ? `, ${dto.inn}` : dto.inn;
        }
        if (dto.companyName) {
            recipientInvoiceRq += recipientInvoiceRq
                ? `, ${dto.companyName}`
                : dto.companyName;
        }
        return recipientInvoiceRq || space;
    }
}
