import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { registerOfferPdfFonts } from '../fonts/offer-pdf-fonts';
import { OfferPdfAssetStore } from '../lib/offer-pdf-asset-store';
import {
    fitPageFrame,
    renderPdfWithLayout,
    type LayoutNode,
    type OfferPdfPageFrame,
} from '../lib/pdf-layout';
import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import {
    findOfferPdfTemplate,
    withLockedSettings,
} from '../templates/offer-pdf-template.registry';

export interface OfferPdfRenderResult {
    buffer: Buffer;
    /** Время рендера в мс — контроль «быстрее Gotenberg» */
    durationMs: number;
    templateCode: OfferPdfTemplateCode;
    /** Дерево раскладки итогового файла: для аудита и отладки */
    layout: LayoutNode;
    /** Поля, подобранные под шапку и подвал; null — хватило полей шаблона */
    frame: OfferPdfPageFrame | null;
    /**
     * Картинки и логотипы стиля, которых не нашлось в storage: документ собран
     * без них. Пути внутри storage/app; пусто — всё на месте.
     */
    missingAssets: string[];
}

/**
 * Модель → шаблон → PDF. Без диска, без ссылок: чистый рендер.
 * Текст и разрывы страниц считает react-pdf по метрикам шрифта. Шапка и
 * подвал — fixed-блоки, текст они не раздвигают: после первого прохода
 * их высота известна, и если реквизиты или контакты менеджера длиннее
 * полей шаблона, документ рисуется второй раз с полями под них.
 */
@Injectable()
export class OfferPdfRenderService {
    private readonly logger = new Logger(OfferPdfRenderService.name);

    /** Хранилище по умолчанию — для тестов и аудита, где сервис создаётся руками */
    constructor(
        private readonly assetStore: OfferPdfAssetStore = new OfferPdfAssetStore(),
    ) {}

    async render(input: OfferPdfDocumentModel): Promise<OfferPdfRenderResult> {
        const template = findOfferPdfTemplate(input.templateCode);
        if (!template) {
            throw new NotFoundException(
                `PDF-шаблон КП «${input.templateCode}» не найден`,
            );
        }
        // картинки и логотипы стиля — из storage, до рендера
        const { assets, missing } = await this.assetStore.load({
            images: template.assets,
            logos: template.logos,
        });
        if (missing.length) {
            // не падаем: КП без фона лучше, чем никакого, но это видно в логе и в ответе
            this.logger.error(
                `КП «${template.code}» собран без оформления — нет файлов в storage/app: ${missing.join(', ')}`,
            );
        }
        // настройки, которые стиль задаёт сам, — поверх выбора менеджера
        const model = { ...withLockedSettings(input, template), assets };
        registerOfferPdfFonts();

        const started = performance.now();
        let rendered = await renderPdfWithLayout(template.render(model));
        const frame = fitPageFrame(rendered.layout);
        if (frame) {
            rendered = await renderPdfWithLayout(template.render(model, frame));
        }
        const durationMs = Math.round(performance.now() - started);
        this.logger.log(
            `КП «${template.code}»: ${rendered.buffer.length} байт за ${durationMs} мс` +
                (frame
                    ? `, поля ${frame.paddingTop}/${frame.paddingBottom}`
                    : ''),
        );

        return {
            buffer: rendered.buffer,
            durationMs,
            templateCode: template.code,
            layout: rendered.layout,
            frame,
            missingAssets: missing,
        };
    }
}
