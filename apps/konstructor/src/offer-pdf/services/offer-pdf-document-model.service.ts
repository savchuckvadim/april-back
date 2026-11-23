import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { formatRu } from '@lib/shared/lib/date/format-ru';
import { OfferLetterRepository } from '@lib/portal-lib/konstructor';
import {
    ProviderService,
    RqEntity,
} from '@lib/portal-lib/konstructor/provider';
import { OfferRenderDataService } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';
import {
    OfferPdfDocumentModel,
    OfferPdfSigner,
} from '../model/offer-pdf-document.model';
import { OfferPdfPrintInput } from '../model/offer-pdf-print-input';
import { resolveOfferPdfSettings } from '../model/offer-pdf-settings';
import { OFFER_PDF_DEFAULT_TEMPLATE_CODE } from '../model/offer-pdf-template-code';

const cleanText = (value?: string | null): string | null => {
    const trimmed = value?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : null;
};

/** Текстовые поля rqs nullable и местами хранят строку 'null'. */
const cleanRqValue = (value?: string | null): string =>
    value && value !== 'null' ? value.trim() : '';

export interface OfferPdfModelOptions {
    /** Название варианта комплекта для титульника и первого листа */
    variantTitle?: string | null;
}

/**
 * Сборка модели документа: данные КП — тем же сервисом, что и для
 * Word-шаблона, поверх — настройки, письмо, подписант и дата. Подписи
 * поставок в запросе уже дополнены: это делает генерация один раз на весь
 * запрос, со всеми вариантами.
 */
@Injectable()
export class OfferPdfDocumentModelService {
    private readonly logger = new Logger(OfferPdfDocumentModelService.name);

    constructor(
        private readonly renderDataService: OfferRenderDataService,
        private readonly providerService: ProviderService,
        private readonly letters: OfferLetterRepository,
    ) {}

    async build(
        dto: OfferPdfPrintInput,
        options: OfferPdfModelOptions = {},
    ): Promise<OfferPdfDocumentModel> {
        const letterText = cleanText(dto.letter?.text);
        const [data, provider, portalLetter] = await Promise.all([
            this.renderDataService.getOfferRenderData(dto),
            this.providerService.findById(Number(dto.providerId)),
            letterText ? Promise.resolve(null) : this.portalLetter(dto.domain),
        ]);

        return {
            templateCode: dto.templateCode ?? OFFER_PDF_DEFAULT_TEMPLATE_CODE,
            palette: cleanText(dto.palette),
            settings: resolveOfferPdfSettings(dto.settings),
            data,
            // письмо: из запроса → письмо портала → текст шаблона по умолчанию
            letter: {
                appeal: cleanText(dto.letter?.appeal),
                text: letterText ?? portalLetter,
            },
            signer: this.getSigner(provider),
            // Логотип/печать/подпись: rqs хранит только id в таблице files
            // старого хранилища — см. постановку, этап 2
            images: {},
            meta: {
                date: formatRu(dayjs(), 'D MMMM YYYY [г.]'),
                documentNumber: cleanText(dto.documentNumber),
            },
            variantTitle: cleanText(options.variantTitle),
        };
    }

    /**
     * Письмо портала по умолчанию из offer_letters. Сбой чтения не роняет
     * КП: письмо возьмётся из текста шаблона по умолчанию.
     */
    private async portalLetter(domain: string): Promise<string | null> {
        try {
            const letter = await this.letters.findPortalDefault(domain);
            return cleanText(letter?.text);
        } catch (error: unknown) {
            this.logger.warn(
                `Письмо портала ${domain} не прочитано: ${error instanceof Error ? error.message : String(error)}`,
            );
            return null;
        }
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
