jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { DocumentFieldDescriptionMode } from '../model/offer-document-settings.type';
import {
    OFFER_PDF_DEFAULT_SETTINGS,
    OfferPdfSettings,
} from '../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { MODERNE_PROMO_TITLE } from '../templates/moderne/moderne.theme';
import { moderneTemplate } from '../templates/moderne/moderne.template';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';
import { collectTexts } from './helpers/react-pdf.mock';

const APPEAL = 'Здравствуйте, Иван Петрович!';

const renderTexts = (settings: Partial<OfferPdfSettings> = {}): string[] =>
    collectTexts(
        moderneTemplate.render(
            createOfferPdfModelFixture({
                templateCode: OfferPdfTemplateCode.MODERNE,
                letter: { appeal: null, text: 'Вот уже 35 лет…' },
                settings: { ...OFFER_PDF_DEFAULT_SETTINGS, ...settings },
            }),
        ),
    );

describe('«Модерн» PDF-шаблон КП', () => {
    it('письмо — на своей странице под заголовком, в начале документа не повторяется', () => {
        const texts = renderTexts();
        const text = texts.join('\n');
        expect(text.indexOf(MODERNE_PROMO_TITLE)).toBeLessThan(
            text.indexOf('Вот уже 35 лет…'),
        );
        expect(texts.filter(item => item === APPEAL)).toHaveLength(1);
        expect(text.indexOf('Вот уже 35 лет…')).toBeLessThan(
            text.indexOf('Информационное наполнение'),
        );
    });

    it('подпись — под письмом на его странице, в разделах не повторяется', () => {
        const texts = renderTexts();
        const text = texts.join('\n');
        expect(texts.filter(item => item === 'А. В. Кузнецов')).toHaveLength(1);
        expect(text.indexOf('Вот уже 35 лет…')).toBeLessThan(
            text.indexOf('А. В. Кузнецов'),
        );
        expect(text.indexOf('А. В. Кузнецов')).toBeLessThan(
            text.indexOf('Информационное наполнение'),
        );
    });

    it('промо выключено — письмо на обычном месте, без заголовка', () => {
        const texts = renderTexts({ withPromo: false });
        expect(texts.join('\n')).not.toContain(MODERNE_PROMO_TITLE);
        expect(texts.filter(item => item === APPEAL)).toHaveLength(1);
    });

    it('письмо выключено — страницы письма нет вовсе, подписи и обращения тоже', () => {
        const texts = renderTexts({ withLetter: false });
        const text = texts.join('\n');
        expect(text).not.toContain(MODERNE_PROMO_TITLE);
        expect(text).not.toContain('Вот уже 35 лет…');
        expect(texts.filter(item => item === APPEAL)).toHaveLength(0);
        expect(text).not.toContain('А. В. Кузнецов');
        expect(text).toContain('Информационное наполнение');
        expect(text).toContain('Стоимость');
    });

    it('без описаний — названия наполнения идут списком в две колонки', () => {
        const text = renderTexts({
            descriptionMode: DocumentFieldDescriptionMode.NO,
        }).join('\n');
        expect(text).toContain('Законодательство России');
        expect(text).not.toContain('Федеральные законы, указы');
    });
});
