import { OfferPdfDocumentModel } from '../../model/offer-pdf-document.model';
import { OFFER_PDF_DEFAULT_SETTINGS } from '../../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import {
    createAlternativeSetFixture,
    createComplectSectionFixture,
    createOfferRenderDataFixture,
} from '@app/konstructor/offer-word/lib/sample-offer-render-data';
import { IProductRenderItemData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-price.service';

export {
    createAlternativeSetFixture,
    createComplectSectionFixture,
    createOfferRenderDataFixture,
};

/**
 * Строки таблицы цен с наборами для сравнения в том порядке, в каком их
 * отдаёт сервис: сначала общий набор, затем наборы для сравнения по порядку
 * (номера наборов 1..N). Сквозная нумерация строк пересчитывается.
 */
export const productRowsWithSets = (
    general: readonly IProductRenderItemData[],
    sets: ReadonlyArray<readonly IProductRenderItemData[]>,
): IProductRenderItemData[] => {
    const alternatives = sets.flatMap((rows, setIndex) =>
        rows.map(
            (row, rowIndex): IProductRenderItemData => ({
                ...row,
                ProductSetKind: 'alternative',
                ProductSetNumber: setIndex + 1,
                ProductSetTitle: `Набор ${setIndex + 1}`,
                IsSetFirstRow: rowIndex === 0,
            }),
        ),
    );
    return [...general, ...alternatives].map((row, index) => ({
        ...row,
        ProductNumber: String(index + 1),
    }));
};

export const createOfferPdfModelFixture = (
    overrides: Partial<OfferPdfDocumentModel> = {},
): OfferPdfDocumentModel => ({
    templateCode: OfferPdfTemplateCode.CLASSIC,
    palette: null,
    settings: { ...OFFER_PDF_DEFAULT_SETTINGS },
    data: createOfferRenderDataFixture(),
    letter: { appeal: null, text: null },
    signer: { position: 'Генеральный директор', name: 'А. В. Кузнецов' },
    images: {},
    meta: { date: '31 октября 2026 г.', documentNumber: null },
    ...overrides,
});
