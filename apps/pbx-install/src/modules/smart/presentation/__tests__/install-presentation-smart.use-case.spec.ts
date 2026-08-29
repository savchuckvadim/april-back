import {
    PRESENTATION_RESULT_ITEMS,
    PRESENTATION_SMART_FIELDS,
} from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { InstallConstSmartService } from '../../const/install-const-smart.service';
import { InstallPresentationSmartUseCase } from '../install-presentation-smart.use-case';

/**
 * Установка смарта «Презентации» общим движком const-смартов: тип со
 * стадиями, поля одиночными userfieldconfig.add (crm — с привязками
 * settings, enum результата — с items), воронка из 6 стадий через
 * install-smart-categories.service; идемпотентность по коду `pres_sales`;
 * сброс кэшей после установки.
 */
const DOMAIN = 'x.bitrix24.ru';

const makeHarness = (over?: {
    existingType?: Record<string, unknown> | null;
    existingFieldNames?: string[];
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
                        type: { id: 8, entityTypeId: 1040, code: 'pres_sales' },
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
            // Обратное поле op_presentations на сделке/компании: list находит
            // его по fieldName+entityId, get отдаёт settings, update фиксирует
            // доливку DYNAMIC_{entityTypeId}.
            list: jest
                .fn()
                .mockImplementation(
                    (dto: {
                        filter: { entityId: string; fieldName: string };
                    }) =>
                        Promise.resolve({
                            result: {
                                fields: [
                                    {
                                        id:
                                            dto.filter.entityId === 'CRM_DEAL'
                                                ? 601
                                                : 602,
                                        entityId: dto.filter.entityId,
                                        fieldName: dto.filter.fieldName,
                                    },
                                ],
                            },
                        }),
                ),
            get: jest.fn().mockImplementation((dto: { id: number }) =>
                Promise.resolve({
                    result: {
                        field: { id: dto.id, settings: { DEAL: 'Y' } },
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
    const presentationSmartService = {
        mirrorFields: jest
            .fn()
            .mockResolvedValue(PRESENTATION_SMART_FIELDS.length),
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
    const useCase = new InstallPresentationSmartUseCase(
        engine,
        presentationSmartService as never,
    );

    return {
        useCase,
        bitrix,
        addedTypes,
        updatedTypes,
        addedFields,
        backRefFieldUpdates,
        portalSmartService,
        presentationSmartService,
        installSmartCategoriesService,
        portalCache,
    };
};

describe('InstallPresentationSmartUseCase', () => {
    it('свежая установка: тип со стадиями + все поля + воронка + сброс кэшей', async () => {
        const {
            useCase,
            addedTypes,
            addedFields,
            portalSmartService,
            presentationSmartService,
            installSmartCategoriesService,
            portalCache,
        } = makeHarness();

        const result = await useCase.execute(DOMAIN);

        // Тип: код идемпотентности + воронка/стадии включены.
        expect(addedTypes).toHaveLength(1);
        expect(addedTypes[0].code).toBe('pres_sales');
        expect(addedTypes[0].title).toBe('Презентации');
        expect(addedTypes[0].isStagesEnabled).toBe('Y');
        expect(addedTypes[0].isCategoriesEnabled).toBe('Y');
        // Вкладки в карточках: сделка, компания, лид, контакт — ради этого
        // зеркало и делается (открывать презентацию из родителя).
        expect(
            (addedTypes[0].relations as { parent: unknown[] }).parent,
        ).toHaveLength(4);

        expect(result.created).toBe(true);
        expect(result.entityTypeId).toBe(1040);
        expect(result.fieldsAdded).toHaveLength(
            PRESENTATION_SMART_FIELDS.length,
        );
        expect(result.fieldsAdded).toContain('UF_CRM_8_PRES_BASE_DEAL');
        expect(result.fieldsFailed).toHaveLength(0);

        // crm-поля ОБЯЗАНЫ иметь привязку settings — иначе значения теряются.
        const baseDeal = addedFields.find(
            field => field.fieldName === 'UF_CRM_8_PRES_BASE_DEAL',
        );
        expect(baseDeal?.settings).toEqual({ DEAL: 'Y' });
        const contact = addedFields.find(
            field => field.fieldName === 'UF_CRM_8_PRES_CONTACT',
        );
        expect(contact?.settings).toEqual({ CONTACT: 'Y' });

        // Результат презентации — enum со справочником исходов.
        const resultField = addedFields.find(
            field => field.fieldName === 'UF_CRM_8_PRES_RESULT',
        );
        expect(resultField?.enum).toHaveLength(
            PRESENTATION_RESULT_ITEMS.length,
        );

        // Лента комментариев — множественное строковое.
        const comments = addedFields.find(
            field => field.fieldName === 'UF_CRM_8_PRES_COMMENTS',
        );
        expect(comments?.multiple).toBe('Y');

        // Зеркала: строка smarts (до стадий) и поля в PortalDB.
        expect(portalSmartService.upsertFromBitrix).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({ entityTypeId: 1040 }),
            'pres',
            'sales',
        );
        expect(presentationSmartService.mirrorFields).toHaveBeenCalledWith(
            DOMAIN,
            8,
            expect.anything(),
            1040,
        );

        // Воронка/стадии — канонический смартовый flow: 6 стадий зеркала
        // сделок + 2 стадии контура согласования заявки (легаси-РПА).
        const categoriesCall =
            installSmartCategoriesService.installTemplateCategories.mock
                .calls[0][0];
        expect(categoriesCall.smartType).toBe('pres');
        expect(categoriesCall.smartGroup).toBe('sales');
        expect(categoriesCall.entityTypeId).toBe(1040);
        expect(categoriesCall.templateCategories).toHaveLength(1);
        expect(categoriesCall.templateCategories[0].stages).toHaveLength(8);

        // Кэши: online-слепок и in-memory резолв смарта.
        expect(portalCache.invalidate).toHaveBeenCalledWith(DOMAIN);
        expect(presentationSmartService.invalidate).toHaveBeenCalledWith(
            DOMAIN,
        );
    });

    it('обратное поле op_presentations привязывается к DYNAMIC_1040 (сделка и компания)', async () => {
        const { useCase, bitrix, backRefFieldUpdates } = makeHarness();

        await useCase.execute(DOMAIN);

        expect(bitrix.userFieldConfig.list).toHaveBeenCalledWith({
            moduleId: 'crm',
            filter: {
                entityId: 'CRM_DEAL',
                fieldName: 'UF_CRM_OP_PRESENTATIONS',
            },
        });
        expect(bitrix.userFieldConfig.list).toHaveBeenCalledWith({
            moduleId: 'crm',
            filter: {
                entityId: 'CRM_COMPANY',
                fieldName: 'UF_CRM_OP_PRESENTATIONS',
            },
        });
        // Доливка, не замена: существующая привязка DEAL пережила установку.
        expect(backRefFieldUpdates).toEqual([
            { id: 601, settings: { DEAL: 'Y', DYNAMIC_1040: 'Y' } },
            { id: 602, settings: { DEAL: 'Y', DYNAMIC_1040: 'Y' } },
        ]);
    });

    it('повторная установка идемпотентна: тип не пересоздаётся, поля не дублируются', async () => {
        const allFieldNames = PRESENTATION_SMART_FIELDS.map(
            def => `UF_CRM_8_${def.code}`,
        );
        const { useCase, bitrix, addedTypes, updatedTypes } = makeHarness({
            existingType: { id: 8, entityTypeId: 1040, code: 'pres_sales' },
            existingFieldNames: allFieldNames,
        });

        const result = await useCase.execute(DOMAIN);

        expect(addedTypes).toHaveLength(0);
        // Best-effort доводка relations существующего типа.
        expect(updatedTypes).toHaveLength(1);
        expect(bitrix.userFieldConfig.add).not.toHaveBeenCalled();
        expect(result.created).toBe(false);
        expect(result.fieldsExisting).toHaveLength(
            PRESENTATION_SMART_FIELDS.length,
        );
        expect(result.fieldsAdded).toHaveLength(0);
    });
});
