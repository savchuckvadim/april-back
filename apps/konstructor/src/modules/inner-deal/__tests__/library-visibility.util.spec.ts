import { BxDocumentDeal } from 'generated/prisma';
import {
    allowedVisibilities,
    canEdit,
    effectiveKind,
    effectiveVisibility,
    isVisibleTo,
    LibraryActor,
} from '../lib/library-visibility.util';

type Row = Pick<
    BxDocumentDeal,
    | 'kind'
    | 'isFavorite'
    | 'visibility'
    | 'portalId'
    | 'creatorBxUserId'
    | 'userId'
    | 'department'
    | 'isArchived'
>;

const row = (over: Partial<Row> = {}): Row => ({
    kind: 'favorite',
    isFavorite: null,
    visibility: 'user',
    portalId: 5n,
    creatorBxUserId: 10,
    userId: 10,
    department: null,
    isArchived: false,
    ...over,
});

const employee: LibraryActor = {
    userId: 10,
    departmentId: 37,
    isHead: false,
    isSuperUser: false,
};
const colleague: LibraryActor = {
    userId: 11,
    departmentId: 37,
    isHead: false,
    isSuperUser: false,
};
const otherDept: LibraryActor = {
    userId: 12,
    departmentId: 41,
    isHead: false,
    isSuperUser: false,
};
const head: LibraryActor = {
    userId: 20,
    departmentId: 37,
    isHead: true,
    isSuperUser: false,
};
const superUser: LibraryActor = {
    userId: 99,
    departmentId: null,
    isHead: false,
    isSuperUser: true,
};

describe('library-visibility: вид и видимость строки', () => {
    it('легаси-избранное Laravel (isFavorite, kind NULL) — favorite только автору', () => {
        const legacy = row({
            kind: null,
            isFavorite: true,
            visibility: null,
            creatorBxUserId: null,
        });
        expect(effectiveKind(legacy)).toBe('favorite');
        expect(effectiveVisibility(legacy)).toBe('user');
        expect(isVisibleTo(legacy, employee)).toBe(true);
        expect(isVisibleTo(legacy, colleague)).toBe(false);
    });

    it('слепки сделок и варианты в библиотеку не попадают', () => {
        expect(effectiveKind(row({ kind: 'deal' }))).toBeNull();
        expect(effectiveKind(row({ kind: null, isFavorite: null }))).toBeNull();
        expect(isVisibleTo(row({ kind: 'variant' }), superUser)).toBe(false);
    });

    it('department видно своему отделу, portal — всем, архив — никому', () => {
        const dept = row({ visibility: 'department', department: '37' });
        expect(isVisibleTo(dept, colleague)).toBe(true);
        expect(isVisibleTo(dept, otherDept)).toBe(false);
        expect(isVisibleTo(row({ visibility: 'portal' }), otherDept)).toBe(
            true,
        );
        expect(
            isVisibleTo(row({ visibility: 'portal', isArchived: true }), head),
        ).toBe(false);
        // Laravel-значение all → global
        expect(
            effectiveVisibility(row({ visibility: 'all', portalId: null })),
        ).toBe('global');
    });

    it('суперпользователь видит всё портала', () => {
        expect(isVisibleTo(row({ visibility: 'user' }), superUser)).toBe(true);
    });
});

describe('library-visibility: права', () => {
    it('сотрудник: избранное только себе, акции заводить не может', () => {
        expect(allowedVisibilities(employee, 'favorite')).toEqual(['user']);
        expect(allowedVisibilities(employee, 'promotion')).toEqual([]);
    });

    it('руководитель/суперпользователь: user|department|portal; без отдела — без department', () => {
        expect(allowedVisibilities(head, 'promotion')).toEqual([
            'user',
            'department',
            'portal',
        ]);
        expect(allowedVisibilities(superUser, 'favorite')).toEqual([
            'user',
            'portal',
        ]);
        // global — только админка
        expect(allowedVisibilities(superUser, 'promotion')).not.toContain(
            'global',
        );
    });

    it('правит автор; чужое личное — никто; отдел/портал — руководитель и суперпользователь', () => {
        expect(canEdit(row(), employee)).toBe(true);
        expect(canEdit(row(), head)).toBe(false);
        const dept = row({
            visibility: 'department',
            department: '37',
            creatorBxUserId: 13,
            userId: 13,
        });
        expect(canEdit(dept, head)).toBe(true);
        expect(canEdit(dept, { ...head, departmentId: 41 })).toBe(false);
        expect(canEdit(dept, colleague)).toBe(false);
        expect(
            canEdit(
                row({ visibility: 'portal', creatorBxUserId: 11 }),
                superUser,
            ),
        ).toBe(true);
        expect(
            canEdit(
                row({
                    kind: 'promotion',
                    visibility: 'global',
                    portalId: null,
                }),
                superUser,
            ),
        ).toBe(false);
    });
});
