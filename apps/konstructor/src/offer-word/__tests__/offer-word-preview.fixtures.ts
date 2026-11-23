import {
    DocumentVariantDto,
    DocumentVariantSetsDto,
} from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import {
    ProductRowSetDto,
    ProductRowSetItemDto,
} from '@app/konstructor/document-generate/dto/product-row-set/product-row-set.dto';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import {
    captionRow,
    supplyDto,
} from '@app/konstructor/document-generate/supply/__tests__/supply-caption.fixtures';
import { SupplyDto } from '@app/konstructor/dto/supply.dto';
import { ComplectCompositionDto } from '@app/konstructor/modules/inner-deal/dto/complect-composition.dto';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { ProductRowFullSetsDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordPdfPreviewRequestDto } from '../dto/offer-word-pdf-preview-request.dto';

/** Строка с ценой: на ней слияние считает общий итог. */
export const pricedRow = (
    row: ProductRowDto,
    sum: number,
    quantity = 12,
): ProductRowDto =>
    Object.assign(row, {
        price: {
            sum,
            current: sum / 12,
            default: sum,
            month: 0,
            quantity,
            discount: { precent: 1, amount: 0, current: 'percent' },
        },
    });

/** Основной набор с одной строкой Гаранта и итогом, названными по `title`. */
export const previewSet = (
    title: string,
    supply: SupplyDto,
    sum: number,
): ProductRowSetDto =>
    Object.assign(new ProductRowSetDto(), {
        id: 1,
        show: true,
        rows: Object.assign(new ProductRowSetItemDto(), {
            garant: [captionRow(`Гарант ${title}`, supply)],
        }),
        total: [pricedRow(captionRow(`Итого ${title}`, supply), sum)],
    });

/** Участник комплекта в том виде, в каком его присылает фронт. */
export const previewVariant = (
    title: string,
    contractType: CONTRACT_LTYPE,
    sum = 100,
    supply: SupplyDto = supplyDto('internet_5', 5),
    quantity = 12,
): DocumentVariantDto =>
    Object.assign(new DocumentVariantDto(), {
        variantSmartId: 1,
        title,
        contractType,
        complect: [],
        contract: { id: 1 },
        supply,
        rows: [captionRow(`Строка ${title}`, supply)],
        sets: Object.assign(new DocumentVariantSetsDto(), {
            general: [previewSet(title, supply, sum)],
            alternative: [],
        }),
        total: pricedRow(captionRow(`Итого ${title}`, supply), sum, quantity),
    });

/** Настройки сборки комплекта: режим и настройки КП. */
export const previewComposition = (
    mode: ComplectModeEnum,
    offer: Partial<ComplectCompositionDto['offer']> = {},
): ComplectCompositionDto => ({
    mode,
    offer: {
        infoblocks: ComplectOfferInfoblocksEnum.INDEPENDENT,
        showAlternatives: false,
        ...offer,
    },
    openVariantSmartId: null,
});

/**
 * Запрос превью: верхние поля — «Итого запроса» по договору LIC. Счёт в
 * запросе заказан и isWord включён: превью обоим флагам не подчиняется.
 */
export const previewRequest = (
    over: Partial<OfferWordPdfPreviewRequestDto> = {},
): OfferWordPdfPreviewRequestDto => {
    const supply = supplyDto('internet_5', 5);
    return Object.assign(new OfferWordPdfPreviewRequestDto(), {
        templateId: '1',
        invoiceTemplateId: '2',
        domain: 'test.bitrix24.ru',
        companyId: '3',
        dealId: '4',
        providerId: 5,
        userId: 6,
        contractType: CONTRACT_LTYPE.LIC,
        complect: [],
        contract: { id: 7 },
        supply,
        rows: [captionRow('Строка запроса', supply)],
        sets: Object.assign(new ProductRowFullSetsDto(), {
            general: [previewSet('запроса', supply, 500)],
            alternative: [],
        }),
        total: pricedRow(captionRow('Итого запроса', supply), 500),
        isWord: true,
        invoice: {
            needGeneralInvoice: true,
            needManyInvoices: true,
            isByPresentationInvoices: false,
            invoiceDate: '',
        },
        ...over,
    });
};
