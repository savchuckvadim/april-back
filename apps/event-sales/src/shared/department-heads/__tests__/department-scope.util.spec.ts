import { DepartmentLike } from '../department-heads.util';
import { departmentScopeOf } from '../department-scope.util';

const users = (...ids: number[]) => ids.map(ID => ({ ID }));

/** «Глава» (309) → ОП (РОП 11) → группа; отдельный ОП 37 (РОП 900). */
const STRUCTURE: DepartmentLike[] = [
    { ID: 79, HEADS: [309], USERS: users(309) },
    { ID: 63, PARENT: 79, HEADS: [11], USERS: users(11, 69) },
    { ID: 67, PARENT: 63, USERS: users(323) },
    { ID: 37, HEADS: [900], USERS: users(413) },
];

const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);

describe('departmentScopeOf — «свой отдел» в shared/department-heads', () => {
    it('отдел получателя и все подотделы, без него самого', () => {
        expect(sorted(departmentScopeOf(STRUCTURE, 309))).toEqual([
            11, 69, 323,
        ]);
    });

    it('руководит отделом, но в нём не числится — отдел всё равно свой', () => {
        expect(sorted(departmentScopeOf(STRUCTURE, 900))).toEqual([413]);
    });
});
