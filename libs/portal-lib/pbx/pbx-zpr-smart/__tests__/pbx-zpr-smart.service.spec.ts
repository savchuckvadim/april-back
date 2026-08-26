import { PbxZprSmartService } from '../pbx-zpr-smart.service';

/**
 * Резолв смарта «Звонки По решению»: PortalModel-путь собирает полный
 * ZprSmartInfo (camel-ключи, enum-значения, stageIdByCode по формуле
 * DT{entityTypeId}_{catId}:{suffix}); при отсутствии в слепке — fallback
 * на зеркало PortalDB; смарт не установлен → null (self-gate); результат
 * кэшируется в памяти на домен и сбрасывается invalidate().
 */
const DOMAIN = 'x.bitrix24.ru';

/** Смарт слепка портала: 2 поля (одно enum) + воронка с 5 стадиями. */
const portalSmart = () => ({
    entityTypeId: 1038,
    bitrixId: 7,
    type: 'zpr',
    group: 'sales',
    fields: [
        {
            code: 'ZPR_BASE_DEAL',
            bitrixId: 'UF_CRM_7_ZPR_BASE_DEAL',
            bitrixCamelId: 'ufCrm7ZprBaseDeal',
            items: [],
        },
        {
            code: 'ZPR_OBJECTIONS',
            bitrixId: 'UF_CRM_7_ZPR_OBJECTIONS',
            bitrixCamelId: 'ufCrm7ZprObjections',
            items: [
                {
                    code: 'zpr_obj_notime',
                    bitrixId: 101,
                    name: 'Не было времени',
                },
                { code: 'zpr_obj_lpr', bitrixId: 102, name: 'ЛПР против' },
            ],
        },
    ],
    categories: [
        {
            bitrixId: '9',
            stages: [
                { code: 'zpr_plan', bitrixId: 'PLAN' },
                { code: 'zpr_pending', bitrixId: 'PENDING' },
                { code: 'zpr_success', bitrixId: 'SUCCESS' },
                { code: 'zpr_noresult', bitrixId: 'NORESULT' },
                { code: 'zpr_fail', bitrixId: 'FAIL' },
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
                type === 'zpr'
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
                      id: BigInt(11),
                      entityTypeId: BigInt(1038),
                      bitrixId: BigInt(7),
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

    const service = new PbxZprSmartService(
        pbxService,
        portalStoreService,
        portalSmartService,
        pbxFieldService,
        categoryRepository,
    );
    return { service, init };
};

describe('PbxZprSmartService.resolveInfo', () => {
    it('PortalModel-путь: полный ZprSmartInfo со стадиями и enum-значениями', async () => {
        const { service } = makeHarness();
        const info = await service.resolveInfo(DOMAIN);

        expect(info).not.toBeNull();
        expect(info!.entityTypeId).toBe(1038);
        expect(info!.typeId).toBe(7);
        expect(info!.ufKeyByCode['ZPR_BASE_DEAL']).toBe('ufCrm7ZprBaseDeal');
        expect(info!.enumItems['ZPR_OBJECTIONS']).toEqual([
            { id: 101, code: 'zpr_obj_notime', value: 'Не было времени' },
            { id: 102, code: 'zpr_obj_lpr', value: 'ЛПР против' },
        ]);
        // Формула стадий смартов: DT{entityTypeId}_{bxCategoryId}:{suffix}.
        expect(info!.stageIdByCode).toEqual({
            zpr_plan: 'DT1038_9:PLAN',
            zpr_pending: 'DT1038_9:PENDING',
            zpr_success: 'DT1038_9:SUCCESS',
            zpr_noresult: 'DT1038_9:NORESULT',
            zpr_fail: 'DT1038_9:FAIL',
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
                    code: 'ZPR_BASE_DEAL',
                    bitrixCamelId: 'ufCrm7ZprBaseDeal',
                    items: [],
                },
                // Пустой bitrixCamelId — ключ по формуле ufCrm{typeId}{Pascal}.
                { code: 'ZPR_PLAN_DATE', bitrixCamelId: '', items: [] },
                {
                    code: 'ZPR_OBJECTIONS',
                    bitrixCamelId: 'ufCrm7ZprObjections',
                    items: [
                        {
                            code: 'zpr_obj_lpr',
                            bitrixId: 102,
                            name: 'ЛПР против',
                        },
                    ],
                },
            ],
            dbCategories: [
                {
                    bitrixId: '9',
                    stages: [
                        { code: 'zpr_plan', bitrixId: 'PLAN' },
                        { code: 'zpr_success', bitrixId: 'SUCCESS' },
                    ],
                },
            ],
        });
        const info = await service.resolveInfo(DOMAIN);

        expect(info).not.toBeNull();
        expect(info!.entityTypeId).toBe(1038);
        expect(info!.typeId).toBe(7);
        expect(info!.ufKeyByCode['ZPR_PLAN_DATE']).toBe('ufCrm7ZprPlanDate');
        expect(info!.enumItems['ZPR_OBJECTIONS']).toEqual([
            { id: 102, code: 'zpr_obj_lpr', value: 'ЛПР против' },
        ]);
        expect(info!.stageIdByCode['zpr_plan']).toBe('DT1038_9:PLAN');
    });

    it('тип есть, стадий нет ни в слепке, ни в БД — null (установка не завершена)', async () => {
        const smart = { ...portalSmart(), categories: [] };
        const { service } = makeHarness({
            smart,
            dbFields: [
                { code: 'ZPR_BASE_DEAL', bitrixCamelId: 'x', items: [] },
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
