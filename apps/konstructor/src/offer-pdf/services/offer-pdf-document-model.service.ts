import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { formatRu } from '@lib/shared/lib/date/format-ru';
import {
    ProviderService,
    RqEntity,
} from '@lib/portal-lib/konstructor/provider';
import { SupplyPayloadEnricherService } from '@app/konstructor/document-generate/supply/supply-payload-enricher.service';
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
        private readonly supplyEnricher: SupplyPayloadEnricherService,
    ) {}

    async build(dto: OfferPdfGenerateDto): Promise<OfferPdfDocumentModel> {
        // Подписи поставок — с бэка по code, как в Word-потоке (легаси-тексты сильнее)
        const enriched: OfferPdfGenerateDto = {
            ...dto,
            supply: await this.supplyEnricher.enrichSupply(dto.supply),
            rows: await this.supplyEnricher.enrichRows(dto.rows),
            total: await this.supplyEnricher.enrichRow(dto.total),
        };
        const [data, provider] = await Promise.all([
            this.renderDataService.getOfferRenderData(enriched),
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
            // Логотип/печать/подпись: rqs хранит только id в таблице files
            // старого хранилища — см. постановку, этап 2
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
