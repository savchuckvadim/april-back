import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { DocumentProductRowService } from '@app/konstructor/document-generate/product-rows/product-row.service';
import { DocumentTotalRowService } from '@app/konstructor/document-generate/product-rows/total-row.service';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ContractDto } from '@app/konstructor/dto/contract.dto';
import {
    InvoiceDataDto,
    OfferWordByTemplateGenerateDto,
    ProductRowFullSetsDto,
} from '../dto/offer-word-generate-request.dto';
import { InvoiceRenderDataService } from '../services/render-data-services/invoice-render-data.service';
import { OfferRenderPriceService } from '../services/render-data-services/offer-render-price.service';

/** Строка и итог набора: мера портала с полным названием, как на порталах с длинными мерами. */
const priced = (measureName: string): ProductRowDto =>
    Object.assign(new ProductRowDto(), {
        name: 'Гарант-Офис',
        price: {
            default: 49122,
            current: 49122,
            quantity: 1,
            sum: 49122,
            month: 8187,
            measure: { name: measureName },
            discount: { precent: 1 },
        },
        product: {
            name: 'Гарант-Офис',
            quantityForKp: '',
            contractCoefficient: 6,
            contract: { contract: null },
        },
        supply: { name: 'Интернет 1 ОД', forkp: '' },
    });

const request = (contractType: CONTRACT_LTYPE, measureName: string) => {
    const set = {
        rows: { garant: [priced(measureName)] },
        total: [priced(measureName)],
    };
    return Object.assign(new OfferWordByTemplateGenerateDto(), {
        providerId: 5,
        contractType,
        recipient: {},
        invoice: Object.assign(new InvoiceDataDto(), {
            needGeneralInvoice: true,
            needManyInvoices: true,
            isByPresentationInvoices: false,
            invoiceDate: '',
        }),
        contract: Object.assign(new ContractDto(), {
            aprilName: 'Информационное обслуживание',
            prepayment: 1,
        }),
        sets: Object.assign(new ProductRowFullSetsDto(), {
            general: [set],
            alternative: [set],
        }),
    });
};

describe('InvoiceRenderDataService: единица измерения по виду договора', () => {
    const service = new InvoiceRenderDataService(
        { findById: jest.fn().mockResolvedValue(null) } as never,
        new OfferRenderPriceService(
            new DocumentTotalRowService(),
            new DocumentProductRowService(),
        ),
        { renderProviderRq: jest.fn().mockReturnValue({}) } as never,
        { getData: jest.fn().mockReturnValue({}) } as never,
    );

    it('лицензия: «шт.», мера портала — в подписи; и в общем счёте, и в наборе для сравнения', async () => {
        const data = await service.getInvoiceRenderData(
            request(CONTRACT_LTYPE.LIC, 'Лицензия 6 месяцев'),
        );

        expect(data.prices.map(price => price.setKind)).toEqual([
            'general',
            'alternative',
        ]);
        for (const price of data.prices) {
            const [row] = price.rows.ProductRows;
            expect(row.ProductMeasure).toBe('шт.');
            expect(row.ProductMeasureCaption).toBe('Лицензия 6 месяцев');
            expect(price.total.TotalRow[0].TotalMeasure).toBe('шт.');
            expect(price.total.TotalRow[0].TotalMeasureCaption).toBe(
                'Лицензия 6 месяцев',
            );
        }
    });

    it('сервисный договор: «мес.» и пустая подпись', async () => {
        const data = await service.getInvoiceRenderData(
            request(CONTRACT_LTYPE.SERVICE, 'месяц'),
        );

        for (const price of data.prices) {
            const [row] = price.rows.ProductRows;
            expect(row.ProductMeasure).toBe('мес.');
            expect(row.ProductMeasureCaption).toBe('');
            expect(price.total.TotalRow[0].TotalMeasure).toBe('мес.');
            expect(price.total.TotalRow[0].TotalMeasureCaption).toBe('');
        }
    });
});
