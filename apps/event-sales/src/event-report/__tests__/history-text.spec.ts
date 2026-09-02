import {
    fitMultipleEntries,
    HISTORY_SCALAR_MAX_CHARS,
    joinScalarHistory,
    MULTI_FIELD_MAX_TOTAL_CHARS,
} from '../services/entity/history-text';

/**
 * Лимиты истории (02.09.2026): скаляр `op_history` склеивается через « | »
 * и режется по ВСЕМУ полю; multiple-ленты не переполняют 64-килобайтную
 * колонку UTS.
 */
describe('joinScalarHistory', () => {
    it('новая запись встаёт вперёд прошлого значения через « | »', () => {
        expect(joinScalarHistory('02.09 Отчёт', '01.09 Отчёт | 31.08 Отчёт')).toBe(
            '02.09 Отчёт | 01.09 Отчёт | 31.08 Отчёт',
        );
    });

    it('пустое прошлое значение — только новая запись, без разделителя', () => {
        expect(joinScalarHistory('02.09 Отчёт', '')).toBe('02.09 Отчёт');
        expect(joinScalarHistory('02.09 Отчёт', null)).toBe('02.09 Отчёт');
    });

    it('старые записи отбрасываются с хвоста, пока не влезет', () => {
        const older = ['b'.repeat(30), 'c'.repeat(30), 'd'.repeat(30)].join(
            ' | ',
        );
        const result = joinScalarHistory('a'.repeat(30), older, 70);

        // 30 + 3 + 30 = 63 влезает; третья запись — уже нет, а хвост
        // короче осмысленного минимума, поэтому её нет вовсе.
        expect(result).toBe(`${'a'.repeat(30)} | ${'b'.repeat(30)}`);
        expect(result.length).toBeLessThanOrEqual(70);
    });

    it('последняя влезающая запись режется частично, когда хвост осмыслен', () => {
        const result = joinScalarHistory('a'.repeat(10), 'b'.repeat(200), 100);

        expect(result.startsWith(`${'a'.repeat(10)} | ${'b'.repeat(20)}`)).toBe(
            true,
        );
        expect(result.endsWith('…')).toBe(true);
        expect(result.length).toBeLessThanOrEqual(100);
    });

    it('новая запись длиннее лимита — режется сама, прошлое не пишется', () => {
        const result = joinScalarHistory('x'.repeat(50), 'old', 40);

        expect(result).toBe('x'.repeat(40));
    });

    it('лимит по умолчанию — 4000 символов на всё поле', () => {
        const previous = Array.from({ length: 5 }, () => 'p'.repeat(1000)).join(
            ' | ',
        );
        const result = joinScalarHistory('n'.repeat(1000), previous);

        expect(result.length).toBeLessThanOrEqual(HISTORY_SCALAR_MAX_CHARS);
        expect(result.startsWith('n'.repeat(1000))).toBe(true);
    });
});

describe('fitMultipleEntries', () => {
    it('режет по числу записей, как раньше', () => {
        expect(fitMultipleEntries(['1', '2', '3', '4'], 3)).toEqual([
            '1',
            '2',
            '3',
        ]);
    });

    it('сверх суммарной длины отбрасывает старые записи с хвоста', () => {
        const entries = ['a'.repeat(50), 'b'.repeat(50), 'c'.repeat(50)];

        expect(fitMultipleEntries(entries, 10, 120)).toEqual([
            'a'.repeat(50),
            'b'.repeat(50),
        ]);
    });

    it('единственная запись длиннее бюджета режется сама', () => {
        expect(fitMultipleEntries(['x'.repeat(100)], 10, 40)).toEqual([
            'x'.repeat(40),
        ]);
    });

    it('бюджет по умолчанию держит тридцать записей по 4000 символов в 64 КБ', () => {
        const entries = Array.from({ length: 30 }, () => 'я'.repeat(4000));
        const kept = fitMultipleEntries(entries, 30);
        const total = kept.reduce((sum, entry) => sum + entry.length, 0);

        expect(total).toBeLessThanOrEqual(MULTI_FIELD_MAX_TOTAL_CHARS);
        // Кириллица — два байта на символ: суммарно меньше 64 КБ.
        expect(total * 2).toBeLessThan(64 * 1024);
        expect(kept.length).toBeGreaterThan(0);
    });
});
