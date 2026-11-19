import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { registerOfferPdfFonts } from '../fonts/offer-pdf-fonts';
import { OfferPdfAssetStore } from '../lib/offer-pdf-asset-store';
import {
    findTextlessPages,
    fitPageFrame,
    measurePageChrome,
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
     * Нижнее поле карточек, с которым документ перерисован, чтобы хвост
     * карточки не печатался пустым листом; null — перерисовка не понадобилась
     */
    surfaceBottom: number | null;
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
 * полей шаблона, документ рисуется второй раз с полями под них. Так же
 * находится хвост карточки на пустом листе (нижнее поле карточки не влезло на
 * лист) и документ рисуется ещё раз с нижним полем карточек по запасу листа.
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
        let surfaceBottom: number | null = null;
        const tails = findTextlessPages(rendered.layout);
        const chrome = measurePageChrome(rendered.layout);
        if (tails.length && chrome) {
            const base: OfferPdfPageFrame = frame ?? {
                paddingTop: chrome.paddingTop,
                paddingBottom: chrome.paddingBottom,
            };
            const slack = Math.min(...tails.map(tail => tail.slack));
            // сначала нижнее поле впритык к запасу листа, затем без него
            const candidates = new Set([Math.max(0, Math.floor(slack) - 1), 0]);
            for (const bottom of candidates) {
                const retried = await renderPdfWithLayout(
                    template.render(model, { ...base, surfaceBottom: bottom }),
                );
                if (findTextlessPages(retried.layout).length === 0) {
                    rendered = retried;
                    surfaceBottom = bottom;
                    break;
                }
            }
            if (surfaceBottom === null) {
                this.logger.warn(
                    `КП «${template.code}»: лист без текста (страницы ${tails.map(tail => tail.page).join(', ')}) убрать не удалось`,
                );
            }
        }
        const durationMs = Math.round(performance.now() - started);
        this.logger.log(
            `КП «${template.code}»: ${rendered.buffer.length} байт за ${durationMs} мс` +
                (frame
                    ? `, поля ${frame.paddingTop}/${frame.paddingBottom}`
                    : '') +
                (surfaceBottom !== null
                    ? `, нижнее поле карточек ${surfaceBottom}`
                    : ''),
        );

        return {
            buffer: rendered.buffer,
            durationMs,
            templateCode: template.code,
            layout: rendered.layout,
            frame,
            surfaceBottom,
            missingAssets: missing,
        };
    }
}
