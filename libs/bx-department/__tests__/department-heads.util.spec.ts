import { IBXDepartment } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import {
    legacyHeadsOf,
    legacyIdFromAccessCode,
    toPositiveInt,
    uniqueIds,
    withHeads,
} from '../lib/department-heads.util';

const dep = (ID: number | string, UF_HEAD?: unknown): IBXDepartment =>
    ({
        ID,
        NAME: `Отдел ${ID}`,
        PARENT: '1',
        SORT: 1,
        UF_HEAD,
    }) as IBXDepartment;

describe('department-heads.util', () => {
    describe('toPositiveInt', () => {
        it.each([
            [107, 107],
            ['107', 107],
            [' 5 ', 5],
            ['0', null],
            [0, null],
            ['', null],
            [null, null],
            [undefined, null],
            ['abc', null],
            [-5, null],
            [1.5, null],
        ])('%p → %p', (raw, expected) => {
            expect(toPositiveInt(raw)).toBe(expected);
        });
    });

    describe('uniqueIds', () => {
        it('убирает дубли и пустые, порядок сохраняет', () => {
            expect(uniqueIds([5, null, 3, 5, undefined, 3, 9])).toEqual([
                5, 3, 9,
            ]);
        });
    });

    describe('legacyIdFromAccessCode', () => {
        it.each([
            ['D620', 620],
            [' D5 ', 5],
            ['D0', null],
            ['SN12', null],
            ['DR620', null],
            ['', null],
            [null, null],
            [undefined, null],
        ])('%p → %p', (code, expected) => {
            expect(legacyIdFromAccessCode(code)).toBe(expected);
        });
    });

    describe('legacyHeadsOf', () => {
        it.each([
            ['число', 107, [107]],
            ['строка', '107', [107]],
            ['массив строк', ['107', '108', '107'], [107, 108]],
            ['«0» — руководителя нет', '0', []],
            ['null', null, []],
            ['ключа нет', undefined, []],
        ])('%s', (_name, raw, expected) => {
            expect(legacyHeadsOf(dep(41, raw))).toEqual(expected);
        });
    });

    describe('withHeads', () => {
        it('v3 (руководитель, зам) при пустом UF_HEAD: HEADS из v3, UF_HEAD = первый', () => {
            const [result] = withHeads(
                [dep(620, null)],
                new Map([[620, [107, 1]]]),
            );

            expect(result.HEADS).toEqual([107, 1]);
            expect(result.UF_HEAD).toBe(107);
        });

        it('v3 и UF_HEAD совпадают: без дублей', () => {
            const [result] = withHeads(
                [dep(620, '107')],
                new Map([[620, [107, 1]]]),
            );

            expect(result.HEADS).toEqual([107, 1]);
            expect(result.UF_HEAD).toBe(107);
        });

        it('v3 недоступна: HEADS из UF_HEAD', () => {
            const [result] = withHeads([dep(41, '202')], new Map());

            expect(result.HEADS).toEqual([202]);
            expect(result.UF_HEAD).toBe(202);
        });

        it('оба источника пусты: HEADS пустой, UF_HEAD null', () => {
            const [result] = withHeads([dep(944)], new Map([[944, []]]));

            expect(result.HEADS).toEqual([]);
            expect(result.UF_HEAD).toBeNull();
        });

        it('легаси расходится с v3: v3 впереди, легаси дописывается', () => {
            const [result] = withHeads([dep(620, 9)], new Map([[620, [5]]]));

            expect(result.HEADS).toEqual([5, 9]);
            expect(result.UF_HEAD).toBe(5);
        });

        it('ID отдела строкой сопоставляется с числовым ключом карты', () => {
            const [result] = withHeads(
                [dep('620', null)],
                new Map([[620, [107]]]),
            );

            expect(result.HEADS).toEqual([107]);
        });

        it('остальные поля отдела не трогает', () => {
            const source = { ...dep(41, '202'), USERS: [{ ID: 202 }] };

            const [result] = withHeads([source], new Map());

            expect(result.NAME).toBe('Отдел 41');
            expect(result.USERS).toEqual([{ ID: 202 }]);
            expect(source.HEADS).toBeUndefined();
        });
    });
});
