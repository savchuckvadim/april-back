import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { formatRu } from '@lib/shared/lib/date/format-ru';
import {
    OfferLetterRepository,
    ProviderImageRole,
    ProviderImageService,
} from '@lib/portal-lib/konstructor';
import {
    ProviderService,
    RqEntity,
} from '@lib/portal-lib/konstructor/provider';
import { OfferRenderDataService } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';
import {
    OfferPdfDocumentModel,
    OfferPdfImages,
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

/**
 * Роли картинок поставщика, которые печатает PDF-КП. Подпись главного
 * бухгалтера хранится у реквизитов, в КП она пока не печатается.
 */
const PDF_IMAGE_ROLES: readonly ProviderImageRole[] = [
    'stamp',
    'signature_director',
    'logo',
];

/** Место картинки в `model.images` по роли; null — КП эту роль не печатает. */
const imageSlot = (role: ProviderImageRole): keyof OfferPdfImages | null => {
    switch (role) {
        case 'stamp':
            return 'stamp';
        case 'signature_director':
            return 'signature';
        case 'logo':
            return 'logo';
        default:
            return null;
    }
};

/** Ошибка чтения одной строкой: переносы в тексте ошибки Prisma лог не ломают. */
const readErrorText = (error: unknown): string => {
    const code =
        typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : null;
    if (code === 'P2021') return 'нет таблицы provider_images';
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/\s+/g, ' ').trim().slice(0, 300);
};

export interface OfferPdfModelOptions {
    /** Название варианта комплекта для титульника и первого листа */
    variantTitle?: string | null;
}

/**
 * Сборка модели документа: данные КП — тем же сервисом, что и для
 * Word-шаблона, поверх — настройки, письмо, подписант, картинки поставщика и
 * дата. Подписи поставок в запросе уже дополнены: это делает генерация один
 * раз на весь запрос, со всеми вариантами.
 */
@Injectable()
export class OfferPdfDocumentModelService {
    private readonly logger = new Logger(OfferPdfDocumentModelService.name);

    constructor(
        private readonly renderDataService: OfferRenderDataService,
        private readonly providerService: ProviderService,
        private readonly letters: OfferLetterRepository,
        private readonly providerImages: ProviderImageService,
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

        const settings = resolveOfferPdfSettings(dto.settings);
        // печать, подпись и логотип печатаются при «с печатями и подписями»
        const images: OfferPdfImages = settings.withStamps
            ? await this.providerImageSet(provider)
            : {};

        return {
            templateCode: dto.templateCode ?? OFFER_PDF_DEFAULT_TEMPLATE_CODE,
            palette: cleanText(dto.palette),
            settings,
            data,
            // письмо: из запроса → письмо портала → текст шаблона по умолчанию
            letter: {
                appeal: cleanText(dto.letter?.appeal),
                text: letterText ?? portalLetter,
            },
            signer: this.getSigner(
                provider,
                Boolean(images.stamp || images.signature),
            ),
            images,
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

    /**
     * Картинки реквизитов поставщика из provider_images. Сбой чтения (нет
     * таблицы до миграции, база недоступна) не роняет КП: одна строка в лог и
     * документ без картинок. Нет файла одной картинки — она пропускается.
     */
    private async providerImageSet(
        rq: RqEntity | null,
    ): Promise<OfferPdfImages> {
        if (!rq) return {};
        try {
            const contents = await this.providerImages.loadContents(
                rq.id,
                PDF_IMAGE_ROLES,
            );
            const images: OfferPdfImages = {};
            for (const { role, data, format } of contents) {
                const slot = imageSlot(role);
                if (slot) images[slot] = { data, format };
            }
            return images;
        } catch (error: unknown) {
            this.logger.warn(
                `Картинки поставщика (реквизиты ${rq.id}) не прочитаны: ${readErrorText(error)}`,
            );
            return {};
        }
    }

    /**
     * Подписант блока «печать и подпись». У реквизитов с руководителем — он и
     * его должность. Без руководителя (ИП) блок печатается, только когда есть
     * печать или подпись: слева стоит название поставщика, как в легаси,
     * справа пусто.
     */
    private getSigner(
        rq: RqEntity | null,
        withStampImages: boolean,
    ): OfferPdfSigner | null {
        const name = cleanRqValue(rq?.director);
        if (name) {
            return {
                name,
                position: cleanRqValue(rq?.position) || 'Руководитель',
            };
        }
        if (!withStampImages) return null;
        const title =
            cleanRqValue(rq?.fullname) ||
            cleanRqValue(rq?.shortname) ||
            cleanRqValue(rq?.name);
        return title ? { name: '', position: title } : null;
    }
}
