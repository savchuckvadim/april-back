import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { formatRu } from '@lib/shared/lib/date/format-ru';
import {
    ProviderService,
    RqEntity,
} from '@lib/portal-lib/konstructor/provider';
import { OfferRenderDataService } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';
import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
import {
    OfferPdfDocumentModel,
    OfferPdfSigner,
} from '../model/offer-pdf-document.model';
import { resolveOfferPdfSettings } from '../model/offer-pdf-settings';
import { OFFER_PDF_DEFAULT_TEMPLATE_CODE } from '../model/offer-pdf-template-code';

const cleanText = (value?: string | null): string | null => {
    const trimmed = value?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : null;
};

/** Текстовые поля rqs nullable и местами хранят строку 'null'. */
const cleanRqValue = (value?: string | null): string =>
    value && value !== 'null' ? value.trim() : '';

/**
 * Сборка модели документа: данные КП — тем же сервисом, что и для
 * Word-шаблона, поверх — настройки, письмо, подписант и дата.
 */
@Injectable()
export class OfferPdfDocumentModelService {
    constructor(
        private readonly renderDataService: OfferRenderDataService,
        private readonly providerService: ProviderService,
    ) {}

    async build(dto: OfferPdfGenerateDto): Promise<OfferPdfDocumentModel> {
        const [data, provider] = await Promise.all([
            this.renderDataService.getOfferRenderData(dto),
            this.providerService.findById(Number(dto.providerId)),
        ]);

        return {
            templateCode: dto.templateCode ?? OFFER_PDF_DEFAULT_TEMPLATE_CODE,
            settings: resolveOfferPdfSettings(dto.settings),
            data,
            letter: {
                appeal: cleanText(dto.letter?.appeal),
                text: cleanText(dto.letter?.text),
            },
            signer: this.getSigner(provider),
            // Логотип/печать/подпись: в RqEntity их пока нет (см. постановку)
            images: {},
            meta: {
                date: formatRu(dayjs(), 'D MMMM YYYY [г.]'),
                documentNumber: cleanText(dto.documentNumber),
            },
        };
    }

    private getSigner(rq: RqEntity | null): OfferPdfSigner | null {
        const name = cleanRqValue(rq?.director);
        if (!name) return null;
        return {
            name,
            position: cleanRqValue(rq?.position) || 'Руководитель',
        };
    }
}
