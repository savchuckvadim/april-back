import { departmentScopeOf as sharedScopeOf } from '../../shared/department-heads/department-scope.util';
import { departmentScopeOf } from '../lib/deal-audit-department-scope';
import { AuditDepartmentLike } from '../lib/deal-audit-heads';

const users = (...ids: number[]) => ids.map(ID => ({ ID }));

/**
 * Структура как на garant: «Глава Воронеж» → ОП Воронеж → группа,
 * «Глава Питер» → ОП СПб, «Тест» → ОП Тест.
 */
const GARANT: AuditDepartmentLike[] = [
    { ID: 1, HEADS: [1], USERS: users(1) },
    { ID: 79, PARENT: 1, HEADS: [309], USERS: users(309) },
    { ID: 63, PARENT: 79, HEADS: [11], USERS: users(11, 69) },
    { ID: 67, PARENT: 63, USERS: users(323, 325) },
    { ID: 81, PARENT: 1, USERS: users(81) },
    { ID: 37, PARENT: 81, HEADS: [900], USERS: users(413, 500) },
    { ID: 87, PARENT: 1, HEADS: [447], USERS: users(447) },
    { ID: 89, PARENT: 87, USERS: users(481) },
];

const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);

describe('departmentScopeOf — «свой отдел» получателя сводки', () => {
    it('«Глава Воронеж»: ОП и группа ниже, без себя и без чужого ОП', () => {
        expect(sorted(departmentScopeOf(GARANT, 309))).toEqual([
            11, 69, 323, 325,
        ]);
    });

    it('руководитель ОП: свой ОП и его группы', () => {
        expect(sorted(departmentScopeOf(GARANT, 11))).toEqual([69, 323, 325]);
    });

    it('сотрудник отдела «Тест»: ОП Тест под ним', () => {
        expect(sorted(departmentScopeOf(GARANT, 447))).toEqual([481]);
    });

    it('руководит отделом, но в нём не числится — отдел всё равно свой', () => {
        expect(sorted(departmentScopeOf(GARANT, 900))).toEqual([413, 500]);
    });

    it('корень: вся структура, кроме себя', () => {
        expect(departmentScopeOf(GARANT, 1).size).toBe(10);
    });

    it('не нашёлся ни в одном отделе — пусто', () => {
        expect(departmentScopeOf(GARANT, 777).size).toBe(0);
    });

    it('цикл PARENT не зацикливает обход', () => {
        const looped: AuditDepartmentLike[] = [
            { ID: 2, PARENT: 3, USERS: users(20) },
            { ID: 3, PARENT: 2, USERS: users(30) },
        ];
        expect(sorted(departmentScopeOf(looped, 20))).toEqual([30]);
    });

    it('реэкспорт общей функции — сводки аудита и отчёт по дублям не разъезжаются', () => {
        expect(departmentScopeOf).toBe(sharedScopeOf);
    });
});
