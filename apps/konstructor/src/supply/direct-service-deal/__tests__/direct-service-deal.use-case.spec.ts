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
            /** Что вернёт поиск сервисных сделок (deal.getList). */
            serviceDeals?: Record<string, unknown>[];
            /** Варианты, которые уже есть у обновляемой сделки. */
            targetVariants?: { smartId: number }[];
        } = {},
    ) => {
        const dealSet = jest.fn().mockResolvedValue({ result: 200 });
        const dealUpdate = jest.fn().mockResolvedValue({});
        const dealGetList = jest
            .fn()
            .mockResolvedValue({ result: over.serviceDeals ?? [] });
        const companyUpdate = jest.fn().mockResolvedValue({});
        const contactUpdate = jest.fn().mockResolvedValue({});
        const productRowGet = jest
            .fn()
            .mockResolvedValue({ result: [{ ID: 1, PRODUCT_NAME: 'Гарант' }] });

        const bitrix = {
            deal: {
                get: jest.fn().mockResolvedValue({ result: SOURCE_DEAL }),
                set: dealSet,
                update: dealUpdate,
                getList: dealGetList,
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

        // варианты исходной сделки и варианты целевой различаются: по ним
        // решается, переносить ли наборы повторно при обновлении
        const listVariants = jest
            .fn()
            .mockImplementation((_domain: string, dealId: number) =>
                Promise.resolve(
                    dealId === 100
                        ? (over.variants ?? [])
                        : (over.targetVariants ?? []),
                ),
            );
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
            dealUpdate,
            dealGetList,
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

    describe('переотправка в отдел сервиса', () => {
        it('prepare показывает уже созданную сервисную сделку, найденную по связи', async () => {
            const { useCase, dealGetList } = build({
                serviceDeals: [
                    {
                        ID: '300',
                        TITLE: 'Гарант-Юрист',
                        STAGE_ID: 'C5:REG_ONE',
                        DATE_CREATE: '2026-09-01T10:15:00+03:00',
                    },
                ],
            });

            const result = await useCase.prepare('gsr.bitrix24.ru', 100);

            expect(result.existingServiceDeal).toEqual({
                id: 300,
                title: 'Гарант-Юрист',
                stageId: 'C5:REG_ONE',
                createdAt: '2026-09-01T10:15:00+03:00',
                matchedBy: 'link',
            });
            // искали в сервисной воронке по полю-связи с базовой сделкой
            const [filter] = dealGetList.mock.calls[0] as [
                Record<string, unknown>,
            ];
            expect(filter.CATEGORY_ID).toBe(5);
            expect(filter.UF_CRM_TO_SALE_DEAL).toEqual(['D_100', '100']);
        });

        it('нет связи — ищем по компании и честно помечаем находку как вероятную', async () => {
            const { useCase, dealGetList } = build();
            dealGetList
                .mockResolvedValueOnce({ result: [] })
                .mockResolvedValueOnce({
                    result: [{ ID: '301', TITLE: 'Старая сервисная' }],
                });

            const result = await useCase.prepare('gsr.bitrix24.ru', 100);

            expect(result.existingServiceDeal).toMatchObject({
                id: 301,
                matchedBy: 'company',
            });
            const [companyFilter] = dealGetList.mock.calls[1] as [
                Record<string, unknown>,
            ];
            expect(companyFilter.COMPANY_ID).toBe('555');
        });

        it('дублей нет — existingServiceDeal пустой, вопрос менеджеру не задаётся', async () => {
            const { useCase } = build({ serviceDeals: [] });

            const result = await useCase.prepare('gsr.bitrix24.ru', 100);

            expect(result.existingServiceDeal).toBeNull();
        });

        it('при создании в сделку пишется ссылка на базовую — по ней найдётся дубль', async () => {
            const { useCase, dealSet } = build();

            const result = await useCase.execute(dto());

            const [fields] = dealSet.mock.calls[0] as [Record<string, unknown>];
            expect(fields.UF_CRM_TO_SALE_DEAL).toBe('D_100');
            expect(result.action).toBe('created');
        });

        it('нет поля связи на портале — сделка всё равно создаётся', async () => {
            const { useCase, dealSet } = build();
            const pbx = (useCase as unknown as { pbx: { init: jest.Mock } })
                .pbx;
            const { bitrix, PortalModel } = (await pbx.init()) as {
                bitrix: unknown;
                PortalModel: {
                    getDealFieldBitrixIdByCode: (code: string) => string | null;
                };
            };
            PortalModel.getDealFieldBitrixIdByCode = (code: string) =>
                code === 'to_sale_deal' ? null : `UF_CRM_${code.toUpperCase()}`;
            pbx.init.mockResolvedValue({ bitrix, PortalModel });

            const result = await useCase.execute(dto());

            expect(result.dealId).toBe(200);
            const [fields] = dealSet.mock.calls[0] as [Record<string, unknown>];
            expect(fields.UF_CRM_TO_SALE_DEAL).toBeUndefined();
        });

        it('update обновляет существующую сделку и не создаёт вторую', async () => {
            const { useCase, dealSet, dealUpdate } = build();

            const result = await useCase.execute(
                dto({ mode: 'update', targetDealId: 300 }),
            );

            expect(dealSet).not.toHaveBeenCalled();
            expect(dealUpdate).toHaveBeenCalledTimes(1);
            const [dealId, fields] = dealUpdate.mock.calls[0] as [
                number,
                Record<string, unknown>,
            ];
            expect(dealId).toBe(300);
            expect(fields.ASSIGNED_BY_ID).toBe('77');
            expect(fields.UF_CRM_NOTE).toBe('от менеджера');
            expect(result).toMatchObject({ dealId: 300, action: 'updated' });
        });

        it('update без targetDealId — ошибка, а не молчаливое создание дубля', async () => {
            const { useCase, dealSet } = build();

            await expect(
                useCase.execute(dto({ mode: 'update' })),
            ).rejects.toThrow(/targetDealId/);
            expect(dealSet).not.toHaveBeenCalled();
        });

        it('update: слепок конструктора перезаписывается с force', async () => {
            const { useCase, copySnapshot } = build();

            await useCase.execute(dto({ mode: 'update', targetDealId: 300 }));

            expect(copySnapshot).toHaveBeenCalledWith(
                expect.objectContaining({ targetDealId: 300, force: true }),
            );
        });

        it('update: варианты, которые уже есть у сделки, повторно не переносятся', async () => {
            const { useCase } = build({
                variants: [{ smartId: 1 }],
                targetVariants: [{ smartId: 9 }],
            });

            const result = await useCase.execute(
                dto({ mode: 'update', targetDealId: 300 }),
            );

            expect(result.variantsCopied).toBe(0);
        });
    });
});
