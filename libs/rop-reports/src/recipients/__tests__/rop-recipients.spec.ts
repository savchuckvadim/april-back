import { DepartmentLike } from '../department-heads.util';
import {
    hasRopRecipients,
    routeRecipients,
    topHeadsOf,
} from '../rop-recipients';
import {
    ROP_MERGE_POLICY,
    ROP_ORPHAN_POLICY,
    ROP_RECIPIENT_ROLE,
    ROP_STRUCTURE_MISSING_WARNING,
    RopRecipientBucket,
    RopRecipientSettings,
    RopRoutingInput,
} from '../rop-recipients.types';

interface Item {
    readonly key: string;
    readonly owners: readonly number[];
}

const users = (...ids: number[]) => ids.map(ID => ({ ID }));

/**
 * Структура как на garant: «Глава» (309) → ОП (РОП 11) → группа без
 * руководителя (323, 325); отдельный ОП 37 (РОП 413, сотрудник 500).
 */
const STRUCTURE: DepartmentLike[] = [
    { ID: 79, HEADS: [309], USERS: users(309) },
    { ID: 63, PARENT: 79, HEADS: [11], USERS: users(11, 69) },
    { ID: 67, PARENT: 63, USERS: users(323, 325) },
    { ID: 37, HEADS: [413], USERS: users(413, 500) },
];

const item = (key: string, ...owners: number[]): Item => ({ key, owners });

/** a — у сотрудников группы; b — у 69 и 500; c — у 500. */
const ITEMS = [item('a', 323, 325), item('b', 69, 500), item('c', 500)];

const NONE: RopRecipientSettings = {
    toHead: false,
    toEmployee: false,
    departmentUserIds: [],
    structureUserIds: [],
};

const route = (
    patch: Partial<Omit<RopRoutingInput<Item>, 'settings'>> & {
        settings: Partial<RopRecipientSettings>;
    },
    warnings: string[] = [],
): RopRecipientBucket<Item>[] =>
    routeRecipients<Item>(
        {
            items: ITEMS,
            keyOf: entry => entry.key,
            ownersOf: entry => entry.owners,
            departments: STRUCTURE,
            merge: ROP_MERGE_POLICY.union,
            orphans: ROP_ORPHAN_POLICY.topHeads,
            ...patch,
            settings: { ...NONE, ...patch.settings },
        },
        warnings,
    );

const view = (buckets: readonly RopRecipientBucket<Item>[]) =>
    buckets.map(bucket => [
        bucket.userId,
        bucket.items.map(entry => entry.key),
    ]);

describe('получатели отчётов РОПу', () => {
    it('РОПу: руководитель получает записи своих сотрудников, у группы без РОПа — РОП выше', () => {
        const buckets = route({ settings: { toHead: true } });
        expect(view(buckets)).toEqual([
            [11, ['a', 'b']],
            [413, ['b', 'c']],
        ]);
        expect(buckets[0].roles).toEqual([ROP_RECIPIENT_ROLE.head]);
    });

    it('по своему отделу: отдел получателя и все подотделы', () => {
        const [bucket] = route({ settings: { departmentUserIds: [309] } });
        expect(bucket.userId).toBe(309);
        expect(bucket.items.map(entry => entry.key)).toEqual(['a', 'b']);
        expect(bucket.roles).toEqual([ROP_RECIPIENT_ROLE.department]);
    });

    it('по всей структуре: все записи, структура не нужна', () => {
        const buckets = route({
            departments: [],
            settings: { structureUserIds: [1] },
        });
        expect(view(buckets)).toEqual([[1, ['a', 'b', 'c']]]);
    });

    it('объединение: человек в нескольких списках получает один набор', () => {
        const buckets = route({
            settings: { toHead: true, departmentUserIds: [11] },
        });
        const rop = buckets.filter(bucket => bucket.userId === 11);
        expect(rop).toHaveLength(1);
        expect(rop[0].items.map(entry => entry.key)).toEqual(['a', 'b']);
        expect(rop[0].roles).toEqual([
            ROP_RECIPIENT_ROLE.department,
            ROP_RECIPIENT_ROLE.head,
        ]);
    });

    it('«шире побеждает»: у РОПа, который сам ведёт записи, — только записи сотрудников', () => {
        const items = [...ITEMS, item('d', 11)];
        const union = route({
            items,
            settings: { toHead: true, toEmployee: true },
        });
        const widest = route({
            items,
            merge: ROP_MERGE_POLICY.widest,
            settings: { toHead: true, toEmployee: true },
        });
        const of11 = (buckets: readonly RopRecipientBucket<Item>[]) =>
            buckets
                .find(bucket => bucket.userId === 11)
                ?.items.map(entry => entry.key);
        expect(of11(union)).toEqual(['a', 'b', 'd']);
        expect(of11(widest)).toEqual(['a', 'b']);
        expect(widest.find(bucket => bucket.userId === 11)?.roles).toEqual([
            ROP_RECIPIENT_ROLE.head,
            ROP_RECIPIENT_ROLE.employee,
        ]);
    });

    it('сотруднику: каждому — свои записи; сиротами записи сотрудников это не делает при ignore', () => {
        const warnings: string[] = [];
        const buckets = route(
            {
                orphans: ROP_ORPHAN_POLICY.ignore,
                settings: { toEmployee: true },
            },
            warnings,
        );
        expect(view(buckets)).toEqual([
            [69, ['b']],
            [323, ['a']],
            [325, ['a']],
            [500, ['b', 'c']],
        ]);
        expect(buckets[0].roles).toEqual([ROP_RECIPIENT_ROLE.employee]);
        expect(warnings).toEqual([]);
    });

    it('структура не прочитана — предупреждение, «по всей структуре» всё равно уходит', () => {
        const warnings: string[] = [];
        const buckets = route(
            {
                departments: [],
                settings: {
                    toHead: true,
                    departmentUserIds: [309],
                    structureUserIds: [1],
                },
            },
            warnings,
        );
        expect(warnings).toEqual([ROP_STRUCTURE_MISSING_WARNING]);
        expect(buckets.map(bucket => bucket.userId)).toEqual([1]);
    });

    it('сироты: записи уволенных — руководителям верхних отделов, с предупреждением', () => {
        const warnings: string[] = [];
        const buckets = route(
            {
                items: [item('e', 900, 901)],
                itemsLabel: 'клиентов',
                settings: { toHead: true },
            },
            warnings,
        );
        expect(view(buckets)).toEqual([
            [309, ['e']],
            [413, ['e']],
        ]);
        expect(buckets[0].roles).toEqual([ROP_RECIPIENT_ROLE.orphan]);
        expect(warnings).toEqual([
            expect.stringContaining('клиентов без получателя: 1'),
        ]);
        expect(warnings[0]).toContain(
            'руководителям верхних отделов: 309, 413',
        );
    });

    it('сироты добавляются и при «шире побеждает»', () => {
        const buckets = route({
            items: [item('d', 11), item('e', 900)],
            merge: ROP_MERGE_POLICY.widest,
            settings: { toHead: true },
        });
        const top = buckets.find(bucket => bucket.userId === 309);
        expect(top?.items.map(entry => entry.key)).toEqual(['d', 'e']);
        expect(top?.roles).toEqual([
            ROP_RECIPIENT_ROLE.head,
            ROP_RECIPIENT_ROLE.orphan,
        ]);
    });

    it('без «РОПу» запись вне выбранных отделов никому не уходит — но в предупреждении', () => {
        const warnings: string[] = [];
        const buckets = route(
            { settings: { departmentUserIds: [309] } },
            warnings,
        );
        expect(buckets.map(bucket => bucket.userId)).toEqual([309]);
        expect(warnings).toEqual([
            expect.stringContaining('записей без получателя: 1'),
        ]);
        expect(warnings[0]).toContain('никому не ушли');
    });

    it('политика ignore: сирот не рассылаем и не пишем о них', () => {
        const warnings: string[] = [];
        const buckets = route(
            {
                items: [item('e', 900)],
                orphans: ROP_ORPHAN_POLICY.ignore,
                settings: { toHead: true },
            },
            warnings,
        );
        expect(buckets).toEqual([]);
        expect(warnings).toEqual([]);
    });

    it('получатель без записей отбрасывается; мусорные id в настройках не получают ничего', () => {
        const warnings: string[] = [];
        expect(
            route(
                {
                    items: [item('c', 500)],
                    settings: { departmentUserIds: [309] },
                },
                warnings,
            ),
        ).toEqual([]);
        expect(
            view(route({ settings: { structureUserIds: [0, -5, 7] } })),
        ).toEqual([[7, ['a', 'b', 'c']]]);
    });

    it('нет записей — нет получателей и предупреждений', () => {
        const warnings: string[] = [];
        expect(
            route(
                { items: [], departments: [], settings: { toHead: true } },
                warnings,
            ),
        ).toEqual([]);
        expect(warnings).toEqual([]);
    });

    it('верхние отделы: родителя нет в снимке; руководители без повторов', () => {
        expect(topHeadsOf(STRUCTURE)).toEqual([309, 413]);
        expect(topHeadsOf([])).toEqual([]);
    });

    it('задан ли хоть один получатель', () => {
        expect(hasRopRecipients(NONE)).toBe(false);
        expect(hasRopRecipients({ ...NONE, toHead: true })).toBe(true);
        expect(hasRopRecipients({ ...NONE, toEmployee: true })).toBe(true);
        expect(hasRopRecipients({ ...NONE, departmentUserIds: [5] })).toBe(
            true,
        );
        expect(hasRopRecipients({ ...NONE, structureUserIds: [1] })).toBe(true);
    });
});
