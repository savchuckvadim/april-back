jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import {
    OFFER_PDF_DEFAULT_TEMPLATE_CODE,
    OfferPdfTemplateCode,
} from '../model/offer-pdf-template-code';
import {
    findOfferPdfTemplate,
    listOfferPdfTemplates,
    OFFER_PDF_TEMPLATES,
} from '../templates/offer-pdf-template.registry';

describe('реестр PDF-шаблонов КП', () => {
    it('коды шаблонов уникальны и покрывают весь enum', () => {
        const codes = OFFER_PDF_TEMPLATES.map(template => template.code);
        expect(new Set(codes).size).toBe(codes.length);
        expect(codes.sort()).toEqual(
            Object.values(OfferPdfTemplateCode).sort(),
        );
    });

    it('шаблон по умолчанию существует', () => {
        expect(
            findOfferPdfTemplate(OFFER_PDF_DEFAULT_TEMPLATE_CODE),
        ).toBeDefined();
    });

    it('неизвестный код → undefined, а не исключение', () => {
        expect(
            findOfferPdfTemplate('nope' as OfferPdfTemplateCode),
        ).toBeUndefined();
    });

    it('список для UI — только код, название и описание', () => {
        const list = listOfferPdfTemplates();
        expect(list.length).toBe(OFFER_PDF_TEMPLATES.length);
        for (const item of list) {
            expect(Object.keys(item).sort()).toEqual([
                'code',
                'description',
                'name',
            ]);
            expect(item.name.length).toBeGreaterThan(0);
        }
    });
});
