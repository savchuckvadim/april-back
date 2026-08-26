import { PbxPresentationSmartService } from '../pbx-presentation-smart.service';

/**
 * Резолв смарта «Презентации»: PortalModel-путь собирает полный
 * PresentationSmartInfo (camel-ключи, enum-значения, stageIdByCode по формуле
 * DT{entityTypeId}_{catId}:{suffix}); при отсутствии в слепке — fallback на
 * зеркало PortalDB; смарт не установлен → null (self-gate); результат
 * кэшируется в памяти на домен и сбрасывается invalidate().
 */
const DOMAIN = 'x.bitrix24.ru';

/** Смарт слепка портала: 2 поля (одно enum) + воронка с 6 стадиями. */
const portalSmart = () => ({
    entityTypeId: 1040,
    bitrixId: 8,
    type: 'pres',
    group: 'sales',
    fields: [
        {
            code: 'PRES_BASE_DEAL',
            bitrixId: 'UF_CRM_8_PRES_BASE_DEAL',
            bitrixCamelId: 'ufCrm8PresBaseDeal',
            items: [],
        },
        {
            code: 'PRES_RESULT',
            bitrixId: 'UF_CRM_8_PRES_RESULT',
            bitrixCamelId: 'ufCrm8PresResult',
            items: [
                { code: 'pres_res_done', bitrixId: 201, name: 'Состоялась' },
                {
                    code: 'pres_res_moved',
                    bitrixId: 202,
                    name: 'Перенесена',
                },
            ],
        },
    ],
    categories: [
        {
            bitrixId: '11',
            stages: [
                { code: 'pres_new', bitrixId: 'NEW' },
                { code: 'pres_plan', bitrixId: 'PLAN' },
                { code: 'pres_pending', bitrixId: 'PENDING' },
                { code: 'pres_success', bitrixId: 'SUCCESS' },
                { code: 'pres_noresult', bitrixId: 'NORESULT' },
                { code: 'pres_fail', bitrixId: 'FAIL' },
            ],
        },
    ],
});

const makeHarness = (over?: {
    /** null — в слепке смарта нет. */
    smart?: ReturnType<typeof portalSmart> | Record<string, unknown> | null;
    /** null — в локальной БД нет портала. */
    dbPortal?: { id: number } | null;
    dbSmartRow?: Record<string, unknown> | null;
    dbFields?: Array<Record<string, unknown>>;
    dbCategories?: Array<Record<string, unknown>> | null;
}) => {
    const init = jest.fn().mockResolvedValue({
        bitrix: {},
        PortalModel: {
            getSmartByType: (type: string) =>
                type === 'pres'
                    ? over?.smart === undefined
                        ? portalSmart()
                        : over.smart
                    : undefined,
        },
    });
    const pbxService = { init } as never;
    const portalStoreService = {
        getPortalByDomain: jest
            .fn()
            .mockResolvedValue(
                over?.dbPortal === undefined ? { id: 5 } : over.dbPortal,
            ),
    } as never;
    const portalSmartService = {
        findFirstByPortalTypeGroup: jest.fn().mockResolvedValue(
            over?.dbSmartRow === undefined
                ? {
                      id: BigInt(12),
                      entityTypeId: BigInt(1040),
                      bitrixId: BigInt(8),
                  }
                : over.dbSmartRow,
        ),
    } as never;
    const pbxFieldService = {
        findByEntityId: jest.fn().mockResolvedValue(over?.dbFields ?? []),
    } as never;
    const categoryRepository = {
        findByEntity: jest.fn().mockResolvedValue(over?.dbCategories ?? null),
    } as never;

    const service = new PbxPresentationSmartService(
        pbxService,
        portalStoreService,
        portalSmartService,
        pbxFieldService,
        categoryRepository,
    );
    return { service, init };
};

describe('PbxPresentationSmartService.resolveInfo', () => {
    it('PortalModel-путь: полный info со стадиями и enum-значениями', async () => {
        const { service } = makeHarness();
        const info = await service.resolveInfo(DOMAIN);

        expect(info).not.toBeNull();
        expect(info!.entityTypeId).toBe(1040);
        expect(info!.typeId).toBe(8);
        expect(info!.ufKeyByCode['PRES_BASE_DEAL']).toBe('ufCrm8PresBaseDeal');
        expect(info!.enumItems['PRES_RESULT']).toEqual([
            { id: 201, code: 'pres_res_done', value: 'Состоялась' },
            { id: 202, code: 'pres_res_moved', value: 'Перенесена' },
        ]);
        // Формула стадий смартов: DT{entityTypeId}_{bxCategoryId}:{suffix}.
        expect(info!.stageIdByCode).toEqual({
            pres_new: 'DT1040_11:NEW',
            pres_plan: 'DT1040_11:PLAN',
            pres_pending: 'DT1040_11:PENDING',
            pres_success: 'DT1040_11:SUCCESS',
            pres_noresult: 'DT1040_11:NORESULT',
            pres_fail: 'DT1040_11:FAIL',
        });
    });

    it('смарт не установлен нигде — null (self-gate)', async () => {
        const { service } = makeHarness({ smart: null, dbPortal: null });
        expect(await service.resolveInfo(DOMAIN)).toBeNull();
    });

    it('нет в слепке — fallback на зеркало PortalDB (формула camel при пустом bitrixCamelId)', async () => {
        const { service } = makeHarness({
            smart: null,
            dbFields: [
                {
                    code: 'PRES_BASE_DEAL',
                    bitrixCamelId: 'ufCrm8PresBaseDeal',
                    items: [],
                },
                // Пустой bitrixCamelId — ключ по формуле ufCrm{typeId}{Pascal}.
                { code: 'PRES_PLAN_DATE', bitrixCamelId: '', items: [] },
                {
                    code: 'PRES_RESULT',
                    bitrixCamelId: 'ufCrm8PresResult',
                    items: [
                        {
                            code: 'pres_res_done',
                            bitrixId: 201,
                            name: 'Состоялась',
                        },
                    ],
                },
            ],
            dbCategories: [
                {
                    bitrixId: '11',
                    stages: [
                        { code: 'pres_plan', bitrixId: 'PLAN' },
                        { code: 'pres_success', bitrixId: 'SUCCESS' },
                    ],
                },
            ],
        });
        const info = await service.resolveInfo(DOMAIN);

        expect(info).not.toBeNull();
        expect(info!.entityTypeId).toBe(1040);
        expect(info!.ufKeyByCode['PRES_PLAN_DATE']).toBe('ufCrm8PresPlanDate');
        expect(info!.enumItems['PRES_RESULT']).toEqual([
            { id: 201, code: 'pres_res_done', value: 'Состоялась' },
        ]);
        expect(info!.stageIdByCode['pres_plan']).toBe('DT1040_11:PLAN');
    });

    it('тип есть, стадий нет ни в слепке, ни в БД — null (установка не завершена)', async () => {
        const smart = { ...portalSmart(), categories: [] };
        const { service } = makeHarness({
            smart,
            dbFields: [
                { code: 'PRES_BASE_DEAL', bitrixCamelId: 'x', items: [] },
            ],
            dbCategories: [],
        });
        expect(await service.resolveInfo(DOMAIN)).toBeNull();
    });

    it('кэш: повторный резолв не ходит в слепок, invalidate сбрасывает', async () => {
        const { service, init } = makeHarness();

        await service.resolveInfo(DOMAIN);
        await service.resolveInfo(DOMAIN);
        expect(init).toHaveBeenCalledTimes(1);

        service.invalidate(DOMAIN);
        await service.resolveInfo(DOMAIN);
        expect(init).toHaveBeenCalledTimes(2);
    });

    it('кэш: «не установлен» тоже кэшируется (не долбим Bitrix на каждый джоб)', async () => {
        const { service, init } = makeHarness({
            smart: null,
            dbPortal: null,
        });
        expect(await service.resolveInfo(DOMAIN)).toBeNull();
        expect(await service.resolveInfo(DOMAIN)).toBeNull();
        expect(init).toHaveBeenCalledTimes(1);
    });
});
