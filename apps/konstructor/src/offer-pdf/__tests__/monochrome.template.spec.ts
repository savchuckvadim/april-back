jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import {
    OFFER_PDF_DEFAULT_SETTINGS,
    OfferPdfSettings,
} from '../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { monochromeTemplate } from '../templates/monochrome/monochrome.template';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';
import { collectTexts } from './helpers/react-pdf.mock';

const modelWith = (
    settings: Partial<OfferPdfSettings> = {},
): OfferPdfDocumentModel =>
    createOfferPdfModelFixture({
        templateCode: OfferPdfTemplateCode.MONOCHROME,
        settings: { ...OFFER_PDF_DEFAULT_SETTINGS, ...settings },
    });

const renderTexts = (settings: Partial<OfferPdfSettings> = {}): string =>
    collectTexts(monochromeTemplate.render(modelWith(settings))).join('\n');

describe('«Монохром» PDF-шаблон КП', () => {
    it('титульник как в вордовских: комплект, поставка, клиент с ИНН — до письма', () => {
        const text = renderTexts();
        expect(text).toContain('ГАРАНТ-Профессионал. Бухгалтерия');
        expect(text).toContain(
            'Интернет-версия на 3 одновременных пользователя',
        );
        expect(text).toContain('Подготовлено для');
        expect(text).toContain('ООО «Ромашка»');
        expect(text).toContain('ИНН 3664098765');
        expect(text.indexOf('Подготовил')).toBeLessThan(
            text.indexOf('Здравствуйте, Иван Петрович!'),
        );
    });

    it('года на титульнике нет', () => {
        const lines = renderTexts().split('\n');
        expect(lines).not.toContain('2026');
        expect(lines.join('\n')).not.toContain('20\n26');
    });

    it('без титульника — шапка, вкладка и общие блоки', () => {
        const text = renderTexts({ withCover: false });
        expect(text).not.toContain('Подготовлено для');
        expect(text).toContain('31 октября 2026 г.');
        expect(text).toContain('Коммерческое предложение');
        expect(text).toContain('Информационное наполнение');
        expect(text).toContain('145 500,00');
    });

    it('менеджер выключен — на титульнике нет «Подготовил»', () => {
        expect(renderTexts({ withManager: false })).not.toContain('Подготовил');
    });
});
