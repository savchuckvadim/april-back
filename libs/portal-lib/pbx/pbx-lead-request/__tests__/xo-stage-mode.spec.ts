import {
    resolveXoStageMode,
    toXoStageMode,
    XO_STAGE_MODE_DEFAULT,
} from '../type/pbx-xo-event.enum';

/**
 * `new` ставит работу в НАЧАЛО ВОРОНКИ ПРОДАЖ, поэтому политика
 * односторонняя: туда попадает только подтверждённая заявка с сайта.
 * Ошибка в сторону `cold` стоит дёшево (клиент идёт холодным циклом),
 * ошибка в сторону `new` — дорого (лишние в воронке продаж).
 */
describe('toXoStageMode — разбор значения поля', () => {
    it.each([
        ['new', 'new'],
        ['cold', 'cold'],
        ['NEW', 'new'],
        ['  Cold  ', 'cold'],
    ])('%s → %s', (raw, expected) => {
        expect(toXoStageMode(raw)).toBe(expected);
    });

    it.each([
        ['пусто', ''],
        ['пробелы', '   '],
        ['null', null],
        ['снятое значение from_lead (больше не поддерживается)', 'from_lead'],
        ['мусор', 'ololo'],
    ])('%s → null («робот не сказал»)', (_case, raw) => {
        expect(toXoStageMode(raw)).toBeNull();
    });

    it('«робот не сказал» отличается от «робот сказал cold»', () => {
        expect(toXoStageMode('')).toBeNull();
        expect(toXoStageMode('cold')).toBe('cold');
    });
});

describe('resolveXoStageMode — политика', () => {
    describe('поле робота заполнено — оно главнее подтверждения', () => {
        it.each([
            ['new при неподтверждённой заявке', 'new', false, 'new'],
            ['cold при подтверждённой заявке', 'cold', true, 'cold'],
        ])('%s', (_case, field, isRequest, expected) => {
            expect(resolveXoStageMode(field, isRequest)).toBe(expected);
        });
    });

    describe('поле не заполнено — решает подтверждение заявки', () => {
        it('подтверждённая заявка с сайта → new', () => {
            expect(resolveXoStageMode(null, true)).toBe('new');
            expect(resolveXoStageMode('', true)).toBe('new');
        });

        it('заявка не подтверждена → cold', () => {
            expect(resolveXoStageMode(null, false)).toBe('cold');
        });

        it('мусор в поле не считается подтверждением', () => {
            expect(resolveXoStageMode('ololo', false)).toBe('cold');
        });
    });

    it('дефолт — безопасная сторона (cold)', () => {
        expect(XO_STAGE_MODE_DEFAULT).toBe('cold');
        expect(resolveXoStageMode(null, false)).toBe(XO_STAGE_MODE_DEFAULT);
    });
});
