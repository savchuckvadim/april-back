import { PBXService } from '@/modules/pbx';
import { SalesFinanceCacheService } from '../../sales-finance/cache/sales-finance-cache.service';
import { PbxFieldsUseCase } from '../use-cases/pbx-fields.use-case';
import { PBX_SALES_KONSTRUCTOR_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';

const DOMAIN = 'april.bitrix24.ru';

const CONTRACT_TYPE_FIELD = {
    code: PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type,
    name: 'Тип договора',
    bitrixId: 'CONTRACT_TYPE',
    items: [
        { code: 'garant_standart', name: 'Гарант Стандарт', bitrixId: 301 },
    ],
};

const CLIENT_TYPE_FIELD = {
    code: PBX_SALES_EVENT_FIELD_CODES.op_client_type,
    name: 'Тип Клиента',
    bitrixId: 'OP_CLIENT_TYPE',
    items: [{ code: 'commerc', name: 'Коммерческие', bitrixId: 401 }],
};

function makeMocks(options: { withDealFields?: boolean } = {}) {
    const withDealFields = options.withDealFields ?? true;
    const dealUpdate = jest.fn().mockResolvedValue({ result: true });
    const companyUpdate = jest.fn().mockResolvedValue({ result: true });

    const portal = {
        getDealFieldByCode: jest
            .fn()
            .mockImplementation((code: string) =>
                withDealFields && code === CONTRACT_TYPE_FIELD.code
                    ? CONTRACT_TYPE_FIELD
                    : undefined,
            ),
        getDealFieldBitrixIdByCode: jest
            .fn()
            .mockImplementation((code: string) =>
                withDealFields && code === CONTRACT_TYPE_FIELD.code
                    ? `UF_CRM_${CONTRACT_TYPE_FIELD.bitrixId}`
                    : '',
            ),
        getCompanyFieldByCode: jest
            .fn()
            .mockImplementation((code: string) =>
                code === CLIENT_TYPE_FIELD.code ? CLIENT_TYPE_FIELD : undefined,
            ),
        getFieldBitrixId: jest
            .fn()
            .mockImplementation(
                (field: { bitrixId: string }) => `UF_CRM_${field.bitrixId}`,
            ),
    };

    // Живой словарь типов договора (userfield.list) — те же элементы,
    // что у портального поля, чтобы meta-ассерты совпадали.
    const getFieldsList = jest.fn().mockResolvedValue({
        result: [
            {
                FIELD_NAME: `UF_CRM_${CONTRACT_TYPE_FIELD.bitrixId}`,
                LIST: CONTRACT_TYPE_FIELD.items.map(item => ({
                    ID: String(item.bitrixId),
                    VALUE: item.name,
                    XML_ID: item.code,
                })),
            },
        ],
    });

    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix: {
                deal: { update: dealUpdate, getFieldsList },
                company: { update: companyUpdate },
            },
            PortalModel: portal,
        }),
    } as unknown as PBXService;

    const resetByPattern = jest.fn().mockResolvedValue(3);
    const cache = {
        resetByPattern,
        getJson: jest.fn().mockResolvedValue(null),
        setJson: jest.fn().mockResolvedValue(undefined),
    } as unknown as SalesFinanceCacheService;

    return { pbx, cache, dealUpdate, companyUpdate, resetByPattern };
}

describe('PbxFieldsUseCase', () => {
    it('meta: настроенные поля с items, ненастроенные пропущены', async () => {
        const { pbx, cache } = makeMocks();
        const { fields } = await new PbxFieldsUseCase(pbx, cache).getMeta(
            DOMAIN,
        );

        // contract_start/contract_end не настроены в моке → пропущены.
        const codes = fields.map(field => field.code);
        expect(codes).toEqual([
            PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type,
            PBX_SALES_EVENT_FIELD_CODES.op_client_type,
        ]);

        const contractType = fields[0];
        expect(contractType.name).toBe('Тип договора');
        expect(contractType.confirm).toBe(true);
        expect(contractType.items).toEqual([
            { code: 'garant_standart', name: 'Гарант Стандарт' },
        ]);
        // numeric id Bitrix наружу не отдаются
        expect(
            (contractType.items[0] as unknown as Record<string, unknown>)
                .bitrixId,
        ).toBeUndefined();
    });

    it('update: пишет значение и сбрасывает финансовый кэш домена', async () => {
        const { pbx, cache, dealUpdate, resetByPattern } = makeMocks();

        const result = await new PbxFieldsUseCase(pbx, cache).updateValue({
            domain: DOMAIN,
            fieldCode: PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type,
            entityId: 2048,
            value: 'garant_standart',
        });

        expect(result).toEqual({
            fieldCode: PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type,
            entityId: 2048,
            value: 'garant_standart',
        });
        expect(dealUpdate).toHaveBeenCalledWith(2048, {
            UF_CRM_CONTRACT_TYPE: 301,
        });
        expect(resetByPattern).toHaveBeenCalledWith(
            expect.stringContaining(DOMAIN),
        );
    });

    it('update company-поля идёт в crm.company.update', async () => {
        const { pbx, cache, companyUpdate } = makeMocks();

        await new PbxFieldsUseCase(pbx, cache).updateValue({
            domain: DOMAIN,
            fieldCode: PBX_SALES_EVENT_FIELD_CODES.op_client_type,
            entityId: 512,
            value: 'commerc',
        });

        expect(companyUpdate).toHaveBeenCalledWith(512, {
            UF_CRM_OP_CLIENT_TYPE: 401,
        });
    });
});
