jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { NotFoundException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import type { OfferPdfAssetStore } from '../lib/offer-pdf-asset-store';
import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import { OFFER_PDF_DEFAULT_SETTINGS } from '../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfRenderService } from '../services/offer-pdf-render.service';
import { OfferPdfStylePreviewService } from '../services/offer-pdf-style-preview.service';
import { withLockedSettings } from '../templates/offer-pdf-template.registry';
import { classicTemplate } from '../templates/classic/classic.template';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';

const twoPagePdf = async (): Promise<Buffer> => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.addPage();
    return Buffer.from(await doc.save());
};

describe('превью PDF-стиля', () => {
    const render = jest.fn<
        Promise<{ buffer: Buffer; missingAssets: string[] }>,
        [OfferPdfDocumentModel]
    >();
    /** Подпись файлов стиля: тест меняет её, как будто файл занесли или заменили */
    let assetsVersion = 'v1';
    const load = jest.fn(() =>
        Promise.resolve({
            assets: { images: {}, logos: {} },
            missing: [],
            version: assetsVersion,
        }),
    );
    const createService = (): OfferPdfStylePreviewService =>
        new OfferPdfStylePreviewService(
            { render } as unknown as OfferPdfRenderService,
            { load } as unknown as OfferPdfAssetStore,
        );
    let service: OfferPdfStylePreviewService;

    beforeEach(() => {
        assetsVersion = 'v1';
        render.mockReset();
        render.mockImplementation(async () => ({
            buffer: await twoPagePdf(),
            missingAssets: [],
        }));
        service = createService();
    });

    it('первая страница образца «Гарант-Офис» в выбранном стиле', async () => {
        const preview = await service.preview(OfferPdfTemplateCode.PRISM);
        expect((await PDFDocument.load(preview.buffer)).getPageCount()).toBe(1);
        expect(preview.complete).toBe(true);
        const [model] = render.mock.calls[0];
        expect(model.templateCode).toBe(OfferPdfTemplateCode.PRISM);
        expect(model.data.GeneralProductName).toBe('Гарант-Офис');
        expect(model.settings.withCover).toBe(true);
        // промо-страница превью не нужна: первая страница — титульная
        expect(model.settings.withPromo).toBe(false);
    });

    it('стиль рендерится один раз — дальше из памяти', async () => {
        await service.preview(OfferPdfTemplateCode.CLASSIC);
        await service.preview(OfferPdfTemplateCode.CLASSIC);
        expect(render).toHaveBeenCalledTimes(1);
    });

    it('без гаммы, с первой и с неизвестной гаммой — одно и то же превью', async () => {
        await service.preview(OfferPdfTemplateCode.FACET);
        await service.preview(OfferPdfTemplateCode.FACET, 'нет-такой-гаммы');
        await service.preview(OfferPdfTemplateCode.FACET, '');
        expect(render).toHaveBeenCalledTimes(1);
    });

    it('файл стиля занесли или заменили — превью собирается заново', async () => {
        await service.preview(OfferPdfTemplateCode.PEARL);
        assetsVersion = 'v2';
        await service.preview(OfferPdfTemplateCode.PEARL);
        await service.preview(OfferPdfTemplateCode.PEARL);
        expect(render).toHaveBeenCalledTimes(2);
    });

    it('собранное без файлов помечено неполным — браузеру его не запоминать', async () => {
        render.mockImplementation(async () => ({
            buffer: await twoPagePdf(),
            missingAssets: ['logos/garant_logo_pink.svg'],
        }));
        const preview = await service.preview(OfferPdfTemplateCode.HALO);
        expect(preview.complete).toBe(false);
    });

    it('превью собираются по одному, упавшее не запоминается', async () => {
        let running = 0;
        let peak = 0;
        render.mockImplementation(async model => {
            running += 1;
            peak = Math.max(peak, running);
            await new Promise(resolve => setTimeout(resolve, 5));
            running -= 1;
            if (model.templateCode === OfferPdfTemplateCode.SILK) {
                throw new Error('рендер упал');
            }
            return { buffer: await twoPagePdf(), missingAssets: [] };
        });

        const results = await Promise.allSettled([
            service.preview(OfferPdfTemplateCode.CLASSIC),
            service.preview(OfferPdfTemplateCode.SILK),
            service.preview(OfferPdfTemplateCode.PRISM),
        ]);
        expect(peak).toBe(1);
        expect(results.map(result => result.status)).toEqual([
            'fulfilled',
            'rejected',
            'fulfilled',
        ]);

        // упавший стиль пробуется заново, удачные — из памяти
        await service.preview(OfferPdfTemplateCode.SILK).catch(() => null);
        await service.preview(OfferPdfTemplateCode.CLASSIC);
        expect(render).toHaveBeenCalledTimes(4);
    });

    it('неизвестный стиль — 404', async () => {
        await expect(
            service.preview('nope' as OfferPdfTemplateCode),
        ).rejects.toThrow(NotFoundException);
    });
});

describe('настройки, которые стиль задаёт сам', () => {
    const model = createOfferPdfModelFixture({
        settings: { ...OFFER_PDF_DEFAULT_SETTINGS, isPriceFirst: false },
    });

    it('без зафиксированных — модель как есть', () => {
        expect(withLockedSettings(model, classicTemplate)).toBe(model);
    });

    it('зафиксированные ставятся поверх выбора менеджера', () => {
        const locked = withLockedSettings(model, {
            ...classicTemplate,
            lockedSettings: { isPriceFirst: true },
        });
        expect(locked.settings.isPriceFirst).toBe(true);
        expect(locked.settings.withStamps).toBe(model.settings.withStamps);
    });
});
