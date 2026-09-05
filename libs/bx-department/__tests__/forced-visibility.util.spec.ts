import {
    EBxDepartmentHeadType,
    EBxHeadOfSource,
    EBxVisibilityLevel,
} from '../dto/bx-department-structure.dto';
import {
    applyForcedVisibility,
    EMPTY_FORCED_VISIBILITY,
    forcedLevelFor,
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
});
