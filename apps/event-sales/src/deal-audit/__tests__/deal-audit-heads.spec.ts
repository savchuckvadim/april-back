import { AuditDepartmentLike, buildHeadsByUser } from '../lib/deal-audit-heads';

/*
 * Поиск РОПа переехал в shared/department-heads, его случаи проверяются
 * там (__tests__/department-heads.util.spec.ts). Здесь — только то, что
 * реэкспорт для сводок аудита на месте и работает.
 */
describe('deal-audit: поиск РОПа ответственного (реэкспорт)', () => {
    it('сотрудник подотдела без руководителя получает РОПа родителя', () => {
        const departments: AuditDepartmentLike[] = [
            { ID: 10, PARENT: null, HEADS: [5], USERS: [] },
            { ID: 11, PARENT: 10, USERS: [{ ID: 42 }] },
        ];

        expect(buildHeadsByUser(departments).get(42)).toEqual([5]);
    });
});
