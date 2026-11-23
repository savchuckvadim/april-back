import {
    DocumentVariantDto,
    DocumentVariantSetsDto,
} from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { ProductRowSetDto } from '@app/konstructor/document-generate/dto/product-row-set/product-row-set.dto';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ComplectCompositionDto } from '@app/konstructor/modules/inner-deal/dto/complect-composition.dto';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { ProductRowFullSetsDto } from '@app/konstructor/offer-word/dto/offer-word-generate-request.dto';
import { OfferPdfGenerateDto } from '../../dto/offer-pdf-generate.dto';

/** Строка Гаранта: по ней имя файла берёт «КП <комплект> - <поставка>». */
export const garantRow = (name: string, supplyName: string): ProductRowDto =>
    Object.assign(new ProductRowDto(), {
        name,
        supply: { name: supplyName },
    });

export const garantSet = (row: ProductRowDto): ProductRowSetDto =>
    Object.assign(new ProductRowSetDto(), {
        id: 1,
        show: true,
        rows: { garant: [row] },
        total: [],
    });

/** Итоговая строка: сумма и срок в месяцах нужны слиянию вариантов. */
export const totalRow = (
    name: string,
    sum: number,
    quantity = 12,
): ProductRowDto =>
    Object.assign(new ProductRowDto(), {
        name,
        price: {
            sum,
            current: sum / quantity,
            default: sum,
            month: 0,
            quantity,
            discount: { precent: 1, amount: 0, current: 'percent' },
        },
    });

/** Вариант комплекта: свой комплект в наборе, свой итог. */
export const variantOf = (
    title: string,
    smartId: number | null,
    options: { sum?: number; quantity?: number; product?: string } = {},
): DocumentVariantDto =>
    Object.assign(new DocumentVariantDto(), {
        variantSmartId: smartId,
        title,
        contractType: CONTRACT_LTYPE.ABON,
        complect: [],
        rows: [],
        sets: Object.assign(new DocumentVariantSetsDto(), {
            general: [
                garantSet(garantRow(options.product ?? title, 'Интернет 3 ОД')),
            ],
            alternative: [],
        }),
        total: totalRow(title, options.sum ?? 100, options.quantity),
    });

export const compositionOf = (
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

/** Запрос PDF-КП: сделка, получатель и верхние поля одиночного документа. */
export const pdfRequestOf = (
    over: Partial<OfferPdfGenerateDto> = {},
): OfferPdfGenerateDto =>
    Object.assign(new OfferPdfGenerateDto(), {
        domain: 'test.bitrix24.ru',
        userId: 15,
        companyId: '7',
        dealId: '100',
        providerId: 5,
        contractType: CONTRACT_LTYPE.LIC,
        complect: [],
        rows: [],
        sets: Object.assign(new ProductRowFullSetsDto(), {
            general: [garantSet(garantRow('Бухгалтерия', 'Интернет 3 ОД'))],
            alternative: [],
        }),
        total: totalRow('Итого запроса', 500),
        ...over,
    });
