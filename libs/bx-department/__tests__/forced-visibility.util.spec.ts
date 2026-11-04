import {
    EBxDepartmentHeadType,
    EBxHeadOfSource,
    EBxVisibilityLevel,
} from '../dto/bx-department-structure.dto';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
} from '@lib/portal-lib/store/app-settings';
import {
    applyEmployeeDefault,
    applyForcedVisibility,
    EMPTY_FORCED_VISIBILITY,
    forcedLevelFor,
    parseVisibilityLevel,
    visibilityOf,
} from '../lib/forced-visibility.util';

const membership = {
    myGroupId: 45,
    myOpId: 41,
    allOpIds: [37, 41, 49],
};

describe('forced-visibility.util', () => {
    describe('visibilityOf', () => {
        it.each([
            [EBxDepartmentHeadType.cup, EBxVisibilityLevel.all],
            [EBxDepartmentHeadType.op, EBxVisibilityLevel.department],
            [EBxDepartmentHeadType.group, EBxVisibilityLevel.group],
            [null, EBxVisibilityLevel.own],
        ])('%p → %p', (headOf, expected) => {
            expect(visibilityOf(headOf)).toBe(expected);
        });
    });

    describe('forcedLevelFor', () => {
        const lists = { group: [1, 7], department: [7, 8], all: [9] };

        it('берёт высший из списков, где есть пользователь', () => {
            expect(forcedLevelFor(1, lists)).toBe(EBxVisibilityLevel.group);
            expect(forcedLevelFor(7, lists)).toBe(
                EBxVisibilityLevel.department,
            );
            expect(forcedLevelFor(8, lists)).toBe(
                EBxVisibilityLevel.department,
            );
            expect(forcedLevelFor(9, lists)).toBe(EBxVisibilityLevel.all);
        });

        it('нет в списках — null', () => {
            expect(forcedLevelFor(2, lists)).toBeNull();
            expect(forcedLevelFor(2, EMPTY_FORCED_VISIBILITY)).toBeNull();
        });
    });

    describe('applyForcedVisibility', () => {
        const employee = { headOf: null, headOfDepartmentIds: [] };

        it('без настройки — структурная роль и её уровень, source=structure', () => {
            const result = applyForcedVisibility(
                { headOf: EBxDepartmentHeadType.op, headOfDepartmentIds: [41] },
                null,
                membership,
            );

            expect(result).toEqual({
                headOf: EBxDepartmentHeadType.op,
                headOfDepartmentIds: [41],
                visibility: EBxVisibilityLevel.department,
                headOfSource: EBxHeadOfSource.structure,
            });
        });

        it('настройка не понижает: руководитель ОП в списке group остаётся op', () => {
            const result = applyForcedVisibility(
                { headOf: EBxDepartmentHeadType.op, headOfDepartmentIds: [41] },
                EBxVisibilityLevel.group,
                membership,
            );

            expect(result.headOf).toBe(EBxDepartmentHeadType.op);
            expect(result.visibility).toBe(EBxVisibilityLevel.department);
            expect(result.headOfSource).toBe(EBxHeadOfSource.structure);
        });

        it('равный уровень — тоже структура (source не подменяется)', () => {
            const result = applyForcedVisibility(
                {
                    headOf: EBxDepartmentHeadType.group,
                    headOfDepartmentIds: [45],
                },
                EBxVisibilityLevel.group,
                membership,
            );

            expect(result.headOfSource).toBe(EBxHeadOfSource.structure);
        });

        it('сотрудник в списке group: своя группа, source=settings', () => {
            const result = applyForcedVisibility(
                employee,
                EBxVisibilityLevel.group,
                membership,
            );

            expect(result).toEqual({
                headOf: EBxDepartmentHeadType.group,
                headOfDepartmentIds: [45],
                visibility: EBxVisibilityLevel.group,
                headOfSource: EBxHeadOfSource.settings,
            });
        });

        it('сотрудник в списке department: свой ОП', () => {
            const result = applyForcedVisibility(
                employee,
                EBxVisibilityLevel.department,
                membership,
            );

            expect(result.headOf).toBe(EBxDepartmentHeadType.op);
            expect(result.headOfDepartmentIds).toEqual([41]);
            expect(result.visibility).toBe(EBxVisibilityLevel.department);
        });

        it('group без своей группы → department по своему ОП', () => {
            const result = applyForcedVisibility(
                employee,
                EBxVisibilityLevel.group,
                { ...membership, myGroupId: null },
            );

            expect(result.headOf).toBe(EBxDepartmentHeadType.op);
            expect(result.headOfDepartmentIds).toEqual([41]);
            expect(result.visibility).toBe(EBxVisibilityLevel.department);
        });

        it('department вне структуры продаж → all по всем ОП', () => {
            const result = applyForcedVisibility(
                employee,
                EBxVisibilityLevel.department,
                { myGroupId: null, myOpId: null, allOpIds: [37, 41, 49] },
            );

            expect(result.headOf).toBe(EBxDepartmentHeadType.cup);
            expect(result.headOfDepartmentIds).toEqual([37, 41, 49]);
            expect(result.visibility).toBe(EBxVisibilityLevel.all);
            expect(result.headOfSource).toBe(EBxHeadOfSource.settings);
        });

        it('group вне структуры → сразу all (двойная эскалация)', () => {
            const result = applyForcedVisibility(
                employee,
                EBxVisibilityLevel.group,
                {
                    myGroupId: null,
                    myOpId: null,
                    allOpIds: [41],
                },
            );

            expect(result.visibility).toBe(EBxVisibilityLevel.all);
            expect(result.headOfDepartmentIds).toEqual([41]);
        });

        it('all поверх руководителя группы: cup и все ОП', () => {
            const result = applyForcedVisibility(
                {
                    headOf: EBxDepartmentHeadType.group,
                    headOfDepartmentIds: [45],
                },
                EBxVisibilityLevel.all,
                membership,
            );

            expect(result.headOf).toBe(EBxDepartmentHeadType.cup);
            expect(result.headOfDepartmentIds).toEqual([37, 41, 49]);
            expect(result.visibility).toBe(EBxVisibilityLevel.all);
        });
    });

    describe('parseVisibilityLevel', () => {
        it.each([
            ['own', EBxVisibilityLevel.own],
            ['group', EBxVisibilityLevel.group],
            ['department', EBxVisibilityLevel.department],
            ['all', EBxVisibilityLevel.all],
        ])('%p → %p', (raw, expected) => {
            expect(parseVisibilityLevel(raw)).toBe(expected);
        });

        it.each(['', 'GROUP', 'everyone', 42, null, undefined, {}])(
            'мусор %p → null',
            raw => {
                expect(parseVisibilityLevel(raw)).toBeNull();
            },
        );

        it('коды options настройки kpi-sales совпадают со словарём уровней', () => {
            const codes = (
                PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.kpiSales]
                    .visibilityEmployeeDefault.options ?? []
            ).map(option => option.code);
            expect(codes).toEqual(Object.values(EBxVisibilityLevel));
        });
    });

    describe('applyEmployeeDefault (портальный уровень для рядовых, 04.11.2026)', () => {
        const employee = {
            headOf: null,
            headOfDepartmentIds: [],
            visibility: EBxVisibilityLevel.own,
            headOfSource: EBxHeadOfSource.structure,
        };

        it('нет дефолта или own — роль без изменений', () => {
            expect(applyEmployeeDefault(employee, null, membership)).toBe(
                employee,
            );
            expect(
                applyEmployeeDefault(
                    employee,
                    EBxVisibilityLevel.own,
                    membership,
                ),
            ).toBe(employee);
        });

        it('рядовой + group: периметр своей группы, headOf остаётся null, source=portal_default', () => {
            const result = applyEmployeeDefault(
                employee,
                EBxVisibilityLevel.group,
                membership,
            );

            expect(result).toEqual({
                headOf: null,
                headOfDepartmentIds: [45],
                visibility: EBxVisibilityLevel.group,
                headOfSource: EBxHeadOfSource.portalDefault,
            });
        });

        it('рядовой + department: свой ОП; all — все ОП', () => {
            expect(
                applyEmployeeDefault(
                    employee,
                    EBxVisibilityLevel.department,
                    membership,
                ),
            ).toMatchObject({
                headOf: null,
                headOfDepartmentIds: [41],
                visibility: EBxVisibilityLevel.department,
            });
            expect(
                applyEmployeeDefault(
                    employee,
                    EBxVisibilityLevel.all,
                    membership,
                ),
            ).toMatchObject({
                headOf: null,
                headOfDepartmentIds: [37, 41, 49],
                visibility: EBxVisibilityLevel.all,
            });
        });

        it('group без своей группы → department по своему ОП', () => {
            const result = applyEmployeeDefault(
                employee,
                EBxVisibilityLevel.group,
                { ...membership, myGroupId: null },
            );

            expect(result.visibility).toBe(EBxVisibilityLevel.department);
            expect(result.headOfDepartmentIds).toEqual([41]);
            expect(result.headOf).toBeNull();
        });

        it('вне структуры продаж дефолт не действует (в отличие от списков)', () => {
            const outside = { myGroupId: null, myOpId: null, allOpIds: [41] };

            expect(
                applyEmployeeDefault(employee, EBxVisibilityLevel.all, outside),
            ).toBe(employee);
        });

        it('не понижает: руководитель ОП при дефолте group остаётся op/department/structure', () => {
            const opHead = {
                headOf: EBxDepartmentHeadType.op,
                headOfDepartmentIds: [41],
                visibility: EBxVisibilityLevel.department,
                headOfSource: EBxHeadOfSource.structure,
            };

            expect(
                applyEmployeeDefault(opHead, EBxVisibilityLevel.group, membership),
            ).toBe(opHead);
            expect(
                applyEmployeeDefault(
                    opHead,
                    EBxVisibilityLevel.department,
                    membership,
                ),
            ).toBe(opHead);
        });

        it('руководитель группы + дефолт department: headOf group сохраняется, периметр — свой ОП', () => {
            const result = applyEmployeeDefault(
                {
                    headOf: EBxDepartmentHeadType.group,
                    headOfDepartmentIds: [45],
                    visibility: EBxVisibilityLevel.group,
                    headOfSource: EBxHeadOfSource.structure,
                },
                EBxVisibilityLevel.department,
                membership,
            );

            expect(result).toEqual({
                headOf: EBxDepartmentHeadType.group,
                headOfDepartmentIds: [41],
                visibility: EBxVisibilityLevel.department,
                headOfSource: EBxHeadOfSource.portalDefault,
            });
        });

        it('список «Отдел продаж» выше дефолта — остаётся список; дефолт выше списка — дефолт', () => {
            const fromList = applyForcedVisibility(
                { headOf: null, headOfDepartmentIds: [] },
                EBxVisibilityLevel.department,
                membership,
            );

            expect(
                applyEmployeeDefault(fromList, EBxVisibilityLevel.group, membership),
            ).toBe(fromList);

            const lifted = applyEmployeeDefault(
                applyForcedVisibility(
                    { headOf: null, headOfDepartmentIds: [] },
                    EBxVisibilityLevel.group,
                    membership,
                ),
                EBxVisibilityLevel.all,
                membership,
            );
            expect(lifted.headOf).toBe(EBxDepartmentHeadType.group);
            expect(lifted.visibility).toBe(EBxVisibilityLevel.all);
            expect(lifted.headOfSource).toBe(EBxHeadOfSource.portalDefault);
        });
    });
});
