import { ClientTypeEnum } from '../../document-generate/type/client.type';
import { CONTRACT_LTYPE } from '../../document-generate/type/contract.type';
import { SupplyTypeEnum } from '../../document-generate/type/supply.type';
import { DocumentSupplyInitFormDto } from '../dto/document-supply-init-form.dto';
import { InitFormService } from '../services/init-form.service';
import { SupplyReportTemplateOrigin } from '../services/template/supply-report-template-source.service';

const DOMAIN = 'gsr.bitrix24.ru';

const dto = (
    over: Partial<DocumentSupplyInitFormDto> = {},
): DocumentSupplyInitFormDto =>
    ({
        domain: DOMAIN,
        companyId: '1',
        contractType: CONTRACT_LTYPE.ABON,
        complect: { name: 'Комплект', title: 'Комплект' },
        products: [],
        arows: [],
        consalting: { product: null },
        star: { product: null },
        productSet: {},
        isSupplyReport: true,
        ...over,
    }) as unknown as DocumentSupplyInitFormDto;

describe('InitFormService — состав формы отчёта', () => {
    let isDbLookupEnabled: jest.Mock;
    let resolveTemplate: jest.Mock;
    let service: InitFormService;

    beforeEach(() => {
        isDbLookupEnabled = jest.fn().mockReturnValue(false);
        resolveTemplate = jest.fn();

        service = new InitFormService(
            // bitrix отдаёт пустой список реквизитов: ветка client нам не важна
            {
                init: jest.fn().mockResolvedValue({
                    bitrix: {
                        requisite: {
                            getList: jest
                                .fn()
                                .mockResolvedValue({ result: [] }),
                        },
                        api: {
                            call: jest.fn().mockResolvedValue({ result: [] }),
                        },
                    },
                }),
            } as never,
            { findByDomain: jest.fn().mockResolvedValue([]) } as never,
            { isDbLookupEnabled, resolve: resolveTemplate } as never,
        );
    });

    it('флаг выключен: резолвер не вызывается, форма из кода', async () => {
        const result = await service.frontInit(dto());

        expect(resolveTemplate).not.toHaveBeenCalled();
        expect(result.supply).toHaveLength(15);
        expect(result.supply?.[0].code).toBe('sale_date');
        expect(result.supply?.[0].isRequired).toBe(true);
    });

    it('флаг включён: настройка из строки применяется к isRequired', async () => {
        isDbLookupEnabled.mockReturnValue(true);
        resolveTemplate.mockResolvedValue({
            path: 'any.docx',
            origin: SupplyReportTemplateOrigin.DB,
            templateId: '7',
            fieldOverrides: {
                requiredCodes: ['contract_number'],
                optionalCodes: ['sale_date'],
            },
        });

        const result = await service.frontInit(dto());

        const byCode = new Map(result.supply?.map(f => [f.code, f]) ?? []);
        expect(byCode.get('contract_number')?.isRequired).toBe(true);
        expect(byCode.get('sale_date')?.isRequired).toBe(false);
        // состав и порядок не изменились
        expect(result.supply).toHaveLength(15);
        expect(result.supply?.[0].code).toBe('sale_date');
    });

    it('признаки подбора уходят из DTO', async () => {
        isDbLookupEnabled.mockReturnValue(true);
        resolveTemplate.mockResolvedValue({
            path: 'any.docx',
            origin: SupplyReportTemplateOrigin.STORAGE_FALLBACK,
            templateId: null,
        });

        await service.frontInit(
            dto({
                providerId: 12,
                supplyType: SupplyTypeEnum.INTERNET,
                // легаси-конструктор шлёт SelectItem, а не строку-код
                clientType: { code: ClientTypeEnum.ORG },
            }),
        );

        expect(resolveTemplate).toHaveBeenCalledWith({
            domain: DOMAIN,
            providerId: 12,
            contractType: CONTRACT_LTYPE.ABON,
            clientType: { code: ClientTypeEnum.ORG },
            supplyType: SupplyTypeEnum.INTERNET,
        });
    });

    it('падение подбора НЕ валит форму: менеджеру она нужна и без БД шаблонов', async () => {
        isDbLookupEnabled.mockReturnValue(true);
        resolveTemplate.mockRejectedValue(new Error('БД недоступна'));

        const result = await service.frontInit(dto());

        expect(result.supply).toHaveLength(15);
        expect(result.supply?.[0].isRequired).toBe(true);
    });

    it('без isSupplyReport формы отчёта нет и подбор не нужен', async () => {
        isDbLookupEnabled.mockReturnValue(true);

        const result = await service.frontInit(dto({ isSupplyReport: false }));

        expect(result.supply).toBeUndefined();
        expect(resolveTemplate).not.toHaveBeenCalled();
    });
});
