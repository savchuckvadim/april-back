import { PBXService } from '@lib/pbx';
import { InnerDealService } from '../../../modules/inner-deal/services/inner-deal.service';
import { DirectServiceDealUseCase } from '../use-cases/direct-service-deal.use-case';
import { DirectServiceDealDto } from '../dto/direct-service-deal.dto';

/**
 * Облегчённая поставка: сервисная сделка создаётся из конструктора, минуя RPA.
 * Рег-лист компании обязателен — менеджер видит текущий и либо оставляет его,
 * либо заменяет.
 */
describe('DirectServiceDealUseCase', () => {
    const SOURCE_DEAL = {
        ID: 100,
        TITLE: 'Гарант-Юрист',
        COMPANY_ID: '555',
        UF_CRM_NOTE: 'из базовой сделки',
    };

    const build = (
        over: {
            company?: Record<string, unknown>;
            variants?: { smartId: number }[];
        } = {},
    ) => {
        const dealSet = jest.fn().mockResolvedValue({ result: 200 });
        const companyUpdate = jest.fn().mockResolvedValue({});
        const contactUpdate = jest.fn().mockResolvedValue({});
        const productRowGet = jest
            .fn()
            .mockResolvedValue({ result: [{ ID: 1, PRODUCT_NAME: 'Гарант' }] });

        const bitrix = {
            deal: {
                get: jest.fn().mockResolvedValue({ result: SOURCE_DEAL }),
                set: dealSet,
                update: jest.fn().mockResolvedValue({}),
                contactItemsGet: jest
                    .fn()
                    .mockResolvedValue({ result: [{ CONTACT_ID: 11 }] }),
            },
            company: {
                get: jest.fn().mockResolvedValue({
                    result: over.company ?? {
                        TITLE: 'ООО Ромашка',
                        UF_CRM_USER_CARDNUM: '61-000-001',
                    },
                }),
                update: companyUpdate,
            },
            contact: { update: contactUpdate },
            api: { call: productRowGet },
        };

        const portalModel = {
            getDealCategoryByCode: () => ({ bitrixId: 5, stages: [] }),
            getDealStageByCode: () => ({ bitrixId: 'REG_ONE' }),
            getDealFieldBitrixIdByCode: (code: string) =>
                `UF_CRM_${code.toUpperCase()}`,
            getDealFields: () => [],
            getFieldBitrixId: (item: { bitrixId: string }) => item.bitrixId,
            getSmartByType: () => undefined,
        };

        const pbx = {
            init: jest
                .fn()
                .mockResolvedValue({ bitrix, PortalModel: portalModel }),
        } as unknown as PBXService;

        const listVariants = jest.fn().mockResolvedValue(over.variants ?? []);
        const copySnapshot = jest
            .fn()
            .mockResolvedValue({ copied: true, reason: null, deal: null });
        const innerDeal = {
            listVariants,
            copySnapshot,
        } as unknown as InnerDealService;

        return {
            useCase: new DirectServiceDealUseCase(pbx, innerDeal),
            dealSet,
            companyUpdate,
            contactUpdate,
            copySnapshot,
        };
    };

    const dto = (over: Partial<DirectServiceDealDto> = {}) =>
        ({
            domain: 'gsr.bitrix24.ru',
            sourceDealId: 100,
            managerOsId: 77,
            companyRegistrationList: '61-000-002',
            contractEnd: '2026-09-21T00:00:00+03:00',
            fields: [{ code: 'note', value: 'от менеджера' }],
            ...over,
        }) as DirectServiceDealDto;

    it('prepare показывает текущий рег-лист компании', async () => {
        const { useCase } = build();

        const result = await useCase.prepare('gsr.bitrix24.ru', 100);

        expect(result.companyId).toBe(555);
        expect(result.companyTitle).toBe('ООО Ромашка');
        expect(result.currentRegistrationList).toBe('61-000-001');
        expect(result.contactIds).toEqual([11]);
    });

    it('создаёт сделку в сервисной воронке с ответственным-менеджером ОРК', async () => {
        const { useCase, dealSet } = build();

        const result = await useCase.execute(dto());

        expect(result.dealId).toBe(200);
        const [fields] = dealSet.mock.calls[0] as [Record<string, unknown>];
        expect(fields.CATEGORY_ID).toBe(5);
        expect(fields.ASSIGNED_BY_ID).toBe('77');
        expect(fields.COMPANY_ID).toBe('555');
        // стадия по остатку срока договора
        expect(fields.STAGE_ID).toBe('C5:REG_ONE');
    });

    it('поля менеджера приоритетнее значений базовой сделки', async () => {
        const { useCase, dealSet } = build();

        await useCase.execute(dto());

        const [fields] = dealSet.mock.calls[0] as [Record<string, unknown>];
        expect(fields.UF_CRM_NOTE).toBe('от менеджера');
    });

    it('рег-лист записывается в компанию, ответственные переводятся', async () => {
        const { useCase, companyUpdate, contactUpdate } = build();

        await useCase.execute(dto());

        expect(companyUpdate).toHaveBeenCalledWith(555, {
            ASSIGNED_BY_ID: '77',
            UF_CRM_USER_CARDNUM: '61-000-002',
        });
        expect(contactUpdate).toHaveBeenCalledWith(11, { ASSIGNED_BY_ID: 77 });
    });

    it('слепок конструктора переносится на новую сделку', async () => {
        const { useCase, copySnapshot } = build();

        const result = await useCase.execute(dto());

        expect(result.snapshotCopied).toBe(true);
        expect(copySnapshot).toHaveBeenCalledWith(
            expect.objectContaining({
                targetDealId: 200,
                department: 'service',
                force: true,
            }),
        );
    });

    it('нет сервисной воронки — понятная ошибка, а не создание в никуда', async () => {
        const { useCase } = build();
        const pbx = (
            useCase as unknown as {
                pbx: { init: jest.Mock };
            }
        ).pbx;
        const { bitrix, PortalModel } = (await pbx.init()) as {
            bitrix: unknown;
            PortalModel: { getDealCategoryByCode: () => unknown };
        };
        PortalModel.getDealCategoryByCode = () => undefined;
        pbx.init.mockResolvedValue({ bitrix, PortalModel });

        await expect(useCase.execute(dto())).rejects.toThrow(
            /нет сервисной воронки/,
        );
    });
});
