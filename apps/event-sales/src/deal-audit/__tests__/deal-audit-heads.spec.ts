import { AuditDepartmentLike, buildHeadsByUser } from '../lib/deal-audit-heads';

const department = (
    patch: Partial<AuditDepartmentLike> & Pick<AuditDepartmentLike, 'ID'>,
): AuditDepartmentLike => ({ PARENT: null, USERS: [], ...patch });

describe('deal-audit: поиск РОПа ответственного', () => {
    it('сотрудник получает руководителя своего отдела', () => {
        const heads = buildHeadsByUser([
            department({
                ID: 10,
                HEADS: [5],
                USERS: [{ ID: 42 }, { ID: 43 }],
            }),
        ]);

        expect(heads.get(42)).toEqual([5]);
        expect(heads.get(43)).toEqual([5]);
    });

    it('у подотдела без руководителя берётся руководитель родителя', () => {
        const heads = buildHeadsByUser([
            department({ ID: 10, HEADS: [5] }),
            department({ ID: 11, PARENT: 10, USERS: [{ ID: 42 }] }),
        ]);

        expect(heads.get(42)).toEqual([5]);
    });

    it('сам руководитель получает вышестоящего, а не себя', () => {
        const heads = buildHeadsByUser([
            department({ ID: 1, HEADS: [99] }),
            department({
                ID: 10,
                PARENT: 1,
                HEADS: [5],
                USERS: [{ ID: 5 }, { ID: 42 }],
            }),
        ]);

        expect(heads.get(5)).toEqual([99]);
        expect(heads.get(42)).toEqual([5]);
    });

    it('legacy UF_HEAD работает, когда HEADS не пришёл', () => {
        const heads = buildHeadsByUser([
            department({ ID: 10, UF_HEAD: '7', USERS: [{ ID: 42 }] }),
        ]);

        expect(heads.get(42)).toEqual([7]);
    });

    it('цикл PARENT не зацикливает подъём', () => {
        const heads = buildHeadsByUser([
            department({ ID: 10, PARENT: 11, USERS: [{ ID: 42 }] }),
            department({ ID: 11, PARENT: 10 }),
        ]);

        expect(heads.get(42)).toEqual([]);
    });

    it('руководитель и заместители отдаются вместе, без дублей', () => {
        const heads = buildHeadsByUser([
            department({ ID: 10, HEADS: [5, 6, 5], USERS: [{ ID: 42 }] }),
        ]);

        expect(heads.get(42)).toEqual([5, 6]);
    });
});
