jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { NotFoundException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
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
        Promise<{ buffer: Buffer }>,
        [OfferPdfDocumentModel]
    >();
    const service = new OfferPdfStylePreviewService({
        render,
    } as unknown as OfferPdfRenderService);

    beforeEach(() => {
        render.mockReset();
        render.mockImplementation(async () => ({ buffer: await twoPagePdf() }));
    });

    it('первая страница образца «Гарант-Офис» в выбранном стиле', async () => {
        const pdf = await service.preview(OfferPdfTemplateCode.PRISM);
        expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
        const [model] = render.mock.calls[0];
        expect(model.templateCode).toBe(OfferPdfTemplateCode.PRISM);
        expect(model.data.GeneralProductName).toBe('Гарант-Офис');
        expect(model.settings.withCover).toBe(true);
    });

    it('стиль рендерится один раз — дальше из памяти', async () => {
        await service.preview(OfferPdfTemplateCode.CLASSIC);
        await service.preview(OfferPdfTemplateCode.CLASSIC);
        expect(render).toHaveBeenCalledTimes(1);
    });

    it('неизвестный стиль — 404', () => {
        expect(() => service.preview('nope' as OfferPdfTemplateCode)).toThrow(
            NotFoundException,
        );
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
