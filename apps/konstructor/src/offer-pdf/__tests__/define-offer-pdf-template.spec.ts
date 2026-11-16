jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import type { FC } from 'react';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { CLASSIC_THEME } from '../templates/classic/classic.theme';
import { FACET_PALETTES } from '../templates/facet/facet.theme';
import { defineOfferPdfTemplate } from '../templates/kit/document/define-offer-pdf-template';
import type {
    OfferPdfChrome,
    OfferPdfChromeProps,
} from '../templates/kit/document/offer-pdf-chrome';
import { OFFER_PDF_TEMPLATES } from '../templates/offer-pdf-template.registry';

const Part: FC<OfferPdfChromeProps> = () => null;

const SAMPLE = {
    code: OfferPdfTemplateCode.CLASSIC,
    name: 'Проба',
    description: 'Стиль для теста',
    theme: CLASSIC_THEME,
};

const withChrome = (chrome: Partial<OfferPdfChrome> = {}) =>
    defineOfferPdfTemplate({
        ...SAMPLE,
        chrome: { Header: Part, Footer: Part, ...chrome },
    });

describe('defineOfferPdfTemplate', () => {
    it('титульник и промо объявлены ровно тогда, когда они есть в оформлении', () => {
        expect(withChrome()).toMatchObject({
            hasCover: false,
            hasPromo: false,
        });
        expect(withChrome({ Cover: Part })).toMatchObject({
            hasCover: true,
            hasPromo: false,
        });
        expect(withChrome({ Promo: Part })).toMatchObject({
            hasCover: false,
            hasPromo: true,
        });
        expect(withChrome({ Cover: Part, Promo: Part })).toMatchObject({
            hasCover: true,
            hasPromo: true,
        });
    });

    it('в список картинок попадают все картинки стиля', () => {
        const template = defineOfferPdfTemplate({
            ...SAMPLE,
            chrome: { Header: Part, Footer: Part },
            assets: { cover: 'probe/cover.jpg', sheet: 'probe/sheet.jpg' },
        });
        expect(template.assets).toEqual(['probe/cover.jpg', 'probe/sheet.jpg']);
        expect(withChrome().assets).toBeUndefined();
    });

    it('гаммы стиля уходят в описание как есть', () => {
        const template = defineOfferPdfTemplate({
            code: OfferPdfTemplateCode.FACET,
            name: 'Проба',
            description: 'Стиль с гаммами',
            palettes: FACET_PALETTES,
            chrome: { Header: Part, Footer: Part },
        });
        expect(template.palettes).toBe(FACET_PALETTES);
        expect(withChrome().palettes).toBeUndefined();
    });

    it('у стилей реестра титульник и промо — как раньше (контракт с фронтом)', () => {
        const flags = Object.fromEntries(
            OFFER_PDF_TEMPLATES.map(template => [
                template.code,
                { cover: template.hasCover, promo: template.hasPromo },
            ]),
        );
        expect(flags).toEqual({
            classic: { cover: false, promo: false },
            prism: { cover: true, promo: false },
            monochrome: { cover: true, promo: false },
            facet: { cover: true, promo: true },
            lavender: { cover: true, promo: true },
            pearl: { cover: true, promo: true },
            halo: { cover: true, promo: true },
            silk: { cover: true, promo: true },
            moderne: { cover: true, promo: true },
            iskra: { cover: true, promo: true },
        });
    });
});
