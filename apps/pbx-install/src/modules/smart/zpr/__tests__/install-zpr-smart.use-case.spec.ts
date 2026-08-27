import {
    buildZprInstallCategories,
    ZPR_SMART_FIELDS,
    ZPR_OBJECTION_ITEMS,
} from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { Stage } from '@app/pbx-install/shared';
import { SmartCategoryStageStrategy } from '../../services/smart-categories/smart-category-stage.strategy';
import { InstallConstSmartService } from '../../const/install-const-smart.service';
import { InstallZprSmartUseCase } from '../install-zpr-smart.use-case';

/**
 * Установка ЗПР: тип со стадиями (isStagesEnabled/isCategoriesEnabled),
 * поля одиночными userfieldconfig.add (crm-поля — с привязками settings,
 * enum — с items возражений), воронка/стадии через
 * install-smart-categories.service с ЯВНОЙ семантикой S/F; идемпотентность
 * по ZPR_SMART_CODE; сброс кэшей после установки.
 *
 * Сценарий живёт в общем движке InstallConstSmartService (вынесен, когда за
 * ЗПР пришли «Презентации») — поэтому в харнессе он собирается настоящим, с
 * теми же моками зависимостей.
 */
const DOMAIN = 'x.bitrix24.ru';

const makeHarness = (over?: {
    existingType?: Record<string, unknown> | null;
    existingFieldNames?: string[];
    /** Обратное поле op_zprs: null — не установлено; settings текущего поля. */
    backRefField?: null;
    backRefSettings?: Record<string, unknown>;
}) => {
    const addedTypes: Array<Record<string, unknown>> = [];
    const updatedTypes: Array<Record<string, unknown>> = [];
    const addedFields: Array<Record<string, unknown>> = [];
    const backRefFieldUpdates: Array<{
        id: unknown;
        settings: Record<string, unknown>;
    }> = [];

    const bitrix = {
        smartType: {
            getListFull: jest
                .fn()
                .mockResolvedValue(
                    over?.existingType ? [over.existingType] : [],
                ),
            add: jest.fn().mockImplementation((dto: { fields: unknown }) => {
                addedTypes.push(dto.fields as Record<string, unknown>);
                return Promise.resolve({
                    result: {
                        type: { id: 7, entityTypeId: 1038, code: 'zpr_sales' },
                    },
                });
            }),
            update: jest.fn().mockImplementation((dto: unknown) => {
                updatedTypes.push(dto as Record<string, unknown>);
                return Promise.resolve({ result: true });
            }),
        },
        userFieldConfig: {
            getAllWithItems: jest.fn().mockResolvedValue(
                (over?.existingFieldNames ?? []).map(fieldName => ({
                    fieldName,
                })),
            ),
            add: jest.fn().mockImplementation((dto: { field: unknown }) => {
                addedFields.push(dto.field as Record<string, unknown>);
                return Promise.resolve({ result: true });
            }),
            // Обратные поля (op_zprs на сделке/компании): list находит поле
            // по fieldName+entityId, get отдаёт полные settings, update
            // фиксирует доливку DYNAMIC_{entityTypeId}.
            list: jest
                .fn()
                .mockImplementation(
                    (dto: {
                        filter: { entityId: string; fieldName: string };
                    }) =>
                        Promise.resolve({
                            result: {
                                fields:
                                    over?.backRefField === null
                                        ? []
                                        : [
                                              {
                                                  id:
                                                      dto.filter.entityId ===
                                                      'CRM_DEAL'
                                                          ? 501
                                                          : 502,
                                                  entityId: dto.filter.entityId,
                                                  fieldName:
                                                      dto.filter.fieldName,
                                              },
                                          ],
                            },
                        }),
                ),
            get: jest.fn().mockImplementation((dto: { id: number }) =>
                Promise.resolve({
                    result: {
                        field: {
                            id: dto.id,
                            settings: over?.backRefSettings ?? {
                                DEAL: 'Y',
                                COMPANY: 'Y',
                            },
                        },
                    },
                }),
            ),
            update: jest
                .fn()
                .mockImplementation(
                    (dto: {
                        id: unknown;
                        field: { settings: Record<string, unknown> };
                    }) => {
                        backRefFieldUpdates.push({
                            id: dto.id,
                            settings: dto.field.settings,
                        });
                        return Promise.resolve({ result: true });
                    },
                ),
        },
        api: { call: jest.fn().mockResolvedValue({ result: true }) },
    };

    const pbxService = {
        init: jest.fn().mockResolvedValue({ bitrix }),
    } as never;
    const portalSmartService = {
        upsertFromBitrix: jest.fn().mockResolvedValue(undefined),
    };
    const zprSmartService = {
        mirrorFields: jest.fn().mockResolvedValue(ZPR_SMART_FIELDS.length),
        invalidate: jest.fn(),
    };
    const installSmartCategoriesService = {
        installTemplateCategories: jest.fn().mockResolvedValue(undefined),
    };
    const portalCache = { invalidate: jest.fn().mockResolvedValue(undefined) };

    const engine = new InstallConstSmartService(
        pbxService,
        portalSmartService as never,
        installSmartCategoriesService as never,
        portalCache as never,
    );
    const useCase = new InstallZprSmartUseCase(
        engine,
        zprSmartService as never,
    );

    return {
        useCase,
        bitrix,
        addedTypes,
        updatedTypes,
        addedFields,
        backRefFieldUpdates,
        portalSmartService,
        zprSmartService,
        installSmartCategoriesService,
        portalCache,
    };
};

describe('InstallZprSmartUseCase', () => {
    it('свежая установка: тип со стадиями + 19 полей + воронка + сброс кэшей', async () => {
        const {
            useCase,
            addedTypes,
            addedFields,
            portalSmartService,
            zprSmartService,
            installSmartCategoriesService,
            portalCache,
        } = makeHarness();

        const result = await useCase.execute(DOMAIN);

        // Тип: код идемпотентности + воронка/стадии включены.
        expect(addedTypes).toHaveLength(1);
        expect(addedTypes[0].code).toBe('zpr_sales');
        expect(addedTypes[0].isStagesEnabled).toBe('Y');
        expect(addedTypes[0].isCategoriesEnabled).toBe('Y');
        // Вкладки в карточках: сделка, компания, лид, контакт.
        expect(
            (addedTypes[0].relations as { parent: unknown[] }).parent,
        ).toHaveLength(4);

        // Поля: все 19 из const-конфига, одиночными add.
        expect(result.created).toBe(true);
        expect(result.entityTypeId).toBe(1038);
        expect(result.fieldsAdded).toHaveLength(ZPR_SMART_FIELDS.length);
        expect(result.fieldsAdded).toContain('UF_CRM_7_ZPR_BASE_DEAL');
        expect(result.fieldsFailed).toHaveLength(0);

        // crm-поле ОБЯЗАНО иметь привязку settings — иначе значения теряются.
        const baseDeal = addedFields.find(
            field => field.fieldName === 'UF_CRM_7_ZPR_BASE_DEAL',
        );
        expect(baseDeal?.settings).toEqual({ DEAL: 'Y' });
        const company = addedFields.find(
            field => field.fieldName === 'UF_CRM_7_ZPR_COMPANY',
        );
        expect(company?.settings).toEqual({ COMPANY: 'Y' });

        // Возражения: множественный enum со стартовыми items справочника.
        const objections = addedFields.find(
            field => field.fieldName === 'UF_CRM_7_ZPR_OBJECTIONS',
        );
        expect(objections?.multiple).toBe('Y');
        expect(objections?.enum).toHaveLength(ZPR_OBJECTION_ITEMS.length);

        // Зеркала: строка smarts (до стадий) и поля в PortalDB.
        expect(portalSmartService.upsertFromBitrix).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({ entityTypeId: 1038 }),
            'zpr',
            'sales',
        );
        expect(zprSmartService.mirrorFields).toHaveBeenCalledWith(
            DOMAIN,
            7,
            expect.anything(),
            1038,
        );

        // Воронка/стадии — канонический смартовый flow.
        const categoriesCall =
            installSmartCategoriesService.installTemplateCategories.mock
                .calls[0][0];
        expect(categoriesCall.smartType).toBe('zpr');
        expect(categoriesCall.smartGroup).toBe('sales');
        expect(categoriesCall.entityTypeId).toBe(1038);
        expect(categoriesCall.templateCategories).toHaveLength(1);
        // 6 стадий: план, перенос и ЧЕТЫРЕ исхода (в работе, отказ в
        // разговоре, не дозвонились, отменён).
        expect(categoriesCall.templateCategories[0].stages).toHaveLength(6);

        // Кэши: online-слепок и in-memory резолв ЗПР.
        expect(portalCache.invalidate).toHaveBeenCalledWith(DOMAIN);
        expect(zprSmartService.invalidate).toHaveBeenCalledWith(DOMAIN);
    });

    it('повторная установка идемпотентна: тип не пересоздаётся, поля не дублируются', async () => {
        const allFieldNames = ZPR_SMART_FIELDS.map(
            def => `UF_CRM_7_${def.code}`,
        );
        const { useCase, bitrix, addedTypes, updatedTypes } = makeHarness({
            existingType: { id: 7, entityTypeId: 1038, code: 'zpr_sales' },
            existingFieldNames: allFieldNames,
        });

        const result = await useCase.execute(DOMAIN);

        expect(addedTypes).toHaveLength(0);
        // Best-effort доводка relations существующего типа.
        expect(updatedTypes).toHaveLength(1);
        expect(bitrix.userFieldConfig.add).not.toHaveBeenCalled();
        expect(result.created).toBe(false);
        expect(result.fieldsExisting).toHaveLength(ZPR_SMART_FIELDS.length);
        expect(result.fieldsAdded).toHaveLength(0);
    });

    it('обратное поле op_zprs привязывается к DYNAMIC_{entityTypeId} на сделке и компании', async () => {
        const { useCase, bitrix, backRefFieldUpdates } = makeHarness({
            backRefSettings: { DEAL: 'Y', DYNAMIC_9999: 'Y' },
        });

        await useCase.execute(DOMAIN);

        // Поле ищется типизированным userfieldconfig.list по fieldName+entityId.
        expect(bitrix.userFieldConfig.list).toHaveBeenCalledWith({
            moduleId: 'crm',
            filter: { entityId: 'CRM_DEAL', fieldName: 'UF_CRM_OP_ZPRS' },
        });
        expect(bitrix.userFieldConfig.list).toHaveBeenCalledWith({
            moduleId: 'crm',
            filter: { entityId: 'CRM_COMPANY', fieldName: 'UF_CRM_OP_ZPRS' },
        });

        // settings ДОЛИВАЮТСЯ: существующие привязки (и чужой DYNAMIC_) живы.
        expect(backRefFieldUpdates).toHaveLength(2);
        expect(backRefFieldUpdates[0]).toEqual({
            id: 501,
            settings: { DEAL: 'Y', DYNAMIC_9999: 'Y', DYNAMIC_1038: 'Y' },
        });
        expect(backRefFieldUpdates[1].id).toBe(502);
        expect(backRefFieldUpdates[1].settings.DYNAMIC_1038).toBe('Y');
    });

    it('обратное поле не установлено — привязка пропускается без ошибки', async () => {
        const { useCase, backRefFieldUpdates } = makeHarness({
            backRefField: null,
        });

        const result = await useCase.execute(DOMAIN);

        expect(result.created).toBe(true);
        expect(backRefFieldUpdates).toHaveLength(0);
    });

    it('поле уже привязано — повторная установка не шлёт update (no-op)', async () => {
        const { useCase, backRefFieldUpdates } = makeHarness({
            backRefSettings: { DEAL: 'Y', DYNAMIC_1038: 'Y' },
        });

        await useCase.execute(DOMAIN);

        expect(backRefFieldUpdates).toHaveLength(0);
    });
});

describe('buildZprInstallCategories', () => {
    it('одна воронка, 6 стадий с суффиксами STATUS_ID и явной семантикой', () => {
        const categories = buildZprInstallCategories();
        expect(categories).toHaveLength(1);
        expect(categories[0].isDefault).toBe(true);

        const byCode = Object.fromEntries(
            categories[0].stages.map(stage => [stage.code, stage]),
        );
        expect(byCode['zpr_plan'].bitrixId).toBe('PLAN');
        expect(byCode['zpr_plan'].semantics).toBe('');
        expect(byCode['zpr_pending'].bitrixId).toBe('PENDING');
        expect(byCode['zpr_success'].semantics).toBe('S');
        // «Состоялся: отказ» — звонок сам по себе успешный (дозвонились и
        // поговорили), но клиент отказал прямо в разговоре: для воронки
        // это проигрышный исход.
        expect(byCode['zpr_result_fail'].bitrixId).toBe('RESULT_FAIL');
        expect(byCode['zpr_result_fail'].semantics).toBe('F');
        // Эвристика стратегии NORESULT не знает — семантика обязана быть явной.
        expect(byCode['zpr_noresult'].semantics).toBe('F');
        expect(byCode['zpr_fail'].semantics).toBe('F');
        // Порядок SORT: план → перенос → четыре исхода.
        expect(categories[0].stages.map(stage => stage.order)).toEqual([
            10, 20, 30, 40, 50, 60,
        ]);
    });
});

describe('SmartCategoryStageStrategy + семантика ЗПР', () => {
    const strategy = new SmartCategoryStageStrategy();
    const stage = (over: Partial<Stage>): Stage => over as Stage;

    it('явная семантика const-шаблона важнее эвристики', () => {
        expect(
            strategy.resolveStageSemantics(
                stage({
                    bitrixId: 'NORESULT',
                    code: 'zpr_noresult',
                    semantics: 'F',
                }),
            ),
        ).toBe('F');
        // '' — явная «промежуточная», эвристика не подключается.
        expect(
            strategy.resolveStageSemantics(
                stage({ bitrixId: 'PLAN', code: 'zpr_plan', semantics: '' }),
            ),
        ).toBe('');
    });

    it('Excel-шаблоны без semantics живут по прежней эвристике', () => {
        expect(
            strategy.resolveStageSemantics(
                stage({ bitrixId: 'SUCCESS', code: 'pres_success' }),
            ),
        ).toBe('S');
        expect(
            strategy.resolveStageSemantics(
                stage({ bitrixId: 'X', code: 'pres_fail_any' }),
            ),
        ).toBe('F');
    });

    it('полный STATUS_ID стадий ЗПР собирается формулой смартов', () => {
        expect(strategy.statusId(1038, 9, 'PLAN')).toBe('DT1038_9:PLAN');
        expect(strategy.statusEntityId(1038, 9)).toBe('DYNAMIC_1038_STAGE_9');
    });
});
