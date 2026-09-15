import {
    callOpHistoryEntries,
    callOpHistoryOfEntity,
    OP_HISTORY_TAIL,
} from '../services/call-op-history.util';

/**
 * «ОП История» карточки — быстрый контекст и перекрёстная проверка связей
 * (§4 прод-фиксов). Поле `op_history` НЕ множественное: записи склеены
 * через `|`, поэтому без разбора наружу уезжает одна простыня.
 */
describe('callOpHistoryEntries — разбор истории карточки', () => {
    it('строка со склейкой через | разбирается на записи без пустых', () => {
        expect(
            callOpHistoryEntries(
                '05.09 презентация | 08.09 отказ |  | 09.09 перезвон ',
            ),
        ).toEqual(['05.09 презентация', '08.09 отказ', '09.09 перезвон']);
    });

    it('множественное поле массивом и словарь Битрикса дают тот же результат', () => {
        expect(callOpHistoryEntries(['05.09 презентация|08.09 отказ'])).toEqual(
            ['05.09 презентация', '08.09 отказ'],
        );
        expect(
            callOpHistoryEntries({
                '11': '05.09 презентация',
                '12': '08.09 отказ',
            }),
        ).toEqual(['05.09 презентация', '08.09 отказ']);
    });

    it('берётся ХВОСТ: свежие записи дописываются в конец', () => {
        const entries = Array.from(
            { length: OP_HISTORY_TAIL + 3 },
            (_value, index) => `шаг ${index + 1}`,
        );
        const result = callOpHistoryEntries(entries.join('|'));
        expect(result).toHaveLength(OP_HISTORY_TAIL);
        expect(result[result.length - 1]).toBe(`шаг ${entries.length}`);
        expect(result[0]).toBe(`шаг ${entries.length - OP_HISTORY_TAIL + 1}`);
        expect(callOpHistoryEntries(entries.join('|'), 2)).toEqual([
            `шаг ${entries.length - 1}`,
            `шаг ${entries.length}`,
        ]);
    });

    it('пусто и мусор — пустой список, без падения', () => {
        expect(callOpHistoryEntries(null)).toEqual([]);
        expect(callOpHistoryEntries(undefined)).toEqual([]);
        expect(callOpHistoryEntries('  |  ')).toEqual([]);
        expect(callOpHistoryEntries(() => 'x')).toEqual([]);
    });
});

describe('callOpHistoryOfEntity — история из строки сущности по слепку портала', () => {
    const portal = {
        getEntityFieldByCode: jest.fn((_entity: string, code: string) =>
            code === 'op_history' || code === 'op_mhistory'
                ? { code }
                : undefined,
        ),
        getFieldBitrixId: jest.fn((field: { code: string }) =>
            field.code === 'op_history'
                ? 'UF_CRM_OP_HISTORY'
                : 'UF_CRM_OP_MHISTORY',
        ),
    };

    it('оба поля карточки читаются вместе: строка через | плюс множественное', () => {
        const entries = callOpHistoryOfEntity(portal as never, 'deal', {
            UF_CRM_OP_HISTORY: '05.09 презентация|08.09 отказ',
            UF_CRM_OP_MHISTORY: ['09.09 перезвон'],
        });

        expect(entries).toEqual([
            '05.09 презентация',
            '08.09 отказ',
            '09.09 перезвон',
        ]);
    });

    it('полей нет в слепке портала — пусто, без падения', () => {
        const empty = {
            getEntityFieldByCode: jest.fn(() => undefined),
            getFieldBitrixId: jest.fn(() => ''),
        };
        expect(
            callOpHistoryOfEntity(empty as never, 'lead', {
                UF_CRM_OP_HISTORY: 'что-то',
            }),
        ).toEqual([]);
    });

    it('слепок портала падает на сущности — пусто, без падения', () => {
        const broken = {
            getEntityFieldByCode: jest.fn(() => {
                throw new Error('нет сущности в слепке');
            }),
            getFieldBitrixId: jest.fn(() => ''),
        };
        expect(callOpHistoryOfEntity(broken as never, 'company', {})).toEqual(
            [],
        );
    });
});
