import {
    EDepartamentGroup,
    IDepartment,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    departmentModeCacheKey,
    resolveDepartmentMode,
} from '../lib/department-mode.util';

/** Отдел локальной модели портала (поля по умолчанию — одиночный sales). */
const departament = (overrides: Partial<IDepartment> = {}): IDepartment => ({
    id: 1,
    type: 'sales',
    group: EDepartamentGroup.sales,
    name: 'sales_department',
    title: 'Отдел продаж',
    bitrixId: 1,
    portal_id: 1,
    is_multiple: false,
    multiple_tag: null,
    ...overrides,
});

describe('department-mode.util', () => {
    describe('resolveDepartmentMode', () => {
        it('нет локальной модели портала — одиночный режим без тэга', () => {
            expect(
                resolveDepartmentMode(undefined, EDepartamentGroup.sales),
            ).toEqual({ isMultiple: false, multipleTag: null });
        });

        it('departaments пуст или без нужной группы — одиночный режим', () => {
            expect(
                resolveDepartmentMode(
                    { departaments: [] },
                    EDepartamentGroup.sales,
                ),
            ).toEqual({ isMultiple: false, multipleTag: null });
            expect(
                resolveDepartmentMode(
                    { departaments: [departament({ is_multiple: true })] },
                    EDepartamentGroup.service,
                ),
            ).toEqual({ isMultiple: false, multipleTag: null });
        });

        it('флаг и тэг — из отдела своей группы', () => {
            const portal = {
                departaments: [
                    departament({ is_multiple: false, multiple_tag: 'ОП' }),
                    departament({
                        group: EDepartamentGroup.service,
                        is_multiple: true,
                        multiple_tag: 'ОС',
                    }),
                ],
            };

            expect(
                resolveDepartmentMode(portal, EDepartamentGroup.sales),
            ).toEqual({ isMultiple: false, multipleTag: 'ОП' });
            expect(
                resolveDepartmentMode(portal, EDepartamentGroup.service),
            ).toEqual({ isMultiple: true, multipleTag: 'ОС' });
        });

        it('is_multiple 1/0 (как из JSON) приводится строго к boolean', () => {
            const modeOf = (raw: unknown) =>
                resolveDepartmentMode(
                    {
                        departaments: [
                            departament({ is_multiple: raw as never }),
                        ],
                    },
                    EDepartamentGroup.sales,
                ).isMultiple;

            expect(modeOf(1)).toBe(true);
            expect(modeOf('1')).toBe(true);
            expect(modeOf(true)).toBe(true);
            expect(modeOf(0)).toBe(false);
            expect(modeOf('0')).toBe(false);
            expect(modeOf(null)).toBe(false);
            expect(modeOf(undefined)).toBe(false);
        });

        it('тэг не задан (undefined) — null', () => {
            const portal = {
                departaments: [
                    departament({ is_multiple: true, multiple_tag: undefined }),
                ],
            };

            expect(
                resolveDepartmentMode(portal, EDepartamentGroup.sales)
                    .multipleTag,
            ).toBeNull();
        });
    });

    describe('departmentModeCacheKey', () => {
        it('одиночный режим — single, тэг не влияет', () => {
            expect(
                departmentModeCacheKey({
                    isMultiple: false,
                    multipleTag: '(ОП)',
                }),
            ).toBe('single');
        });

        it('мультирежим — multi_ + нормализованный тэг, без тэга — default', () => {
            expect(
                departmentModeCacheKey({
                    isMultiple: true,
                    multipleTag: '(ОП)',
                }),
            ).toBe('multi_(оп)');
            expect(
                departmentModeCacheKey({
                    isMultiple: true,
                    multipleTag: 'ОП  ОС',
                }),
            ).toBe('multi_оп-ос');
            expect(
                departmentModeCacheKey({ isMultiple: true, multipleTag: null }),
            ).toBe('multi_default');
        });
    });
});
