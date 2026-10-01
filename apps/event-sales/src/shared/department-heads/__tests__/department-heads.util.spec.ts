import {
    buildHeadsByUser,
    DepartmentLike,
    headsOf,
    headsOfUsers,
    toId,
} from '../department-heads.util';

const department = (
    patch: Partial<DepartmentLike> & Pick<DepartmentLike, 'ID'>,
): DepartmentLike => ({ PARENT: null, USERS: [], ...patch });

/** ОП 63 (РОП 11, зам 12) с группой 67 без руководителя и ОП 37 (РОП 413). */
const STRUCTURE = [
    department({ ID: 63, HEADS: [11, 12], USERS: [{ ID: 433 }] }),
    department({ ID: 67, PARENT: 63, USERS: [{ ID: 323 }] }),
    department({ ID: 37, HEADS: [413], USERS: [{ ID: 500 }] }),
];

describe('buildHeadsByUser', () => {
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

describe('headsOf и toId', () => {
    it('HEADS важнее UF_HEAD; мусор и нули отсеиваются', () => {
        expect(
            headsOf(department({ ID: 1, HEADS: [5, '6'], UF_HEAD: 7 })),
        ).toEqual([5, 6]);
        expect(headsOf(department({ ID: 1, HEADS: [], UF_HEAD: '7' }))).toEqual(
            [7],
        );
        expect(headsOf(department({ ID: 1, UF_HEAD: 0 }))).toEqual([]);
        expect(toId('42')).toBe(42);
        expect(toId('x')).toBeNull();
        expect(toId(-1)).toBeNull();
    });
});

describe('headsOfUsers', () => {
    const headsByUser = buildHeadsByUser(STRUCTURE);

    it('руководители и заместители нескольких сотрудников — одним списком без повторов', () => {
        expect(headsOfUsers(headsByUser, [433, 323, 500, 433])).toEqual([
            11, 12, 413,
        ]);
    });

    it('сотрудник вне снимка (уволен, другой отдел) руководителей не добавляет', () => {
        expect(headsOfUsers(headsByUser, [999])).toEqual([]);
        expect(headsOfUsers(headsByUser, [999, 500])).toEqual([413]);
    });

    it('пустой список сотрудников — пустой список руководителей', () => {
        expect(headsOfUsers(headsByUser, [])).toEqual([]);
    });
});
