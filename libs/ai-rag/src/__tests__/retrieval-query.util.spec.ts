import {
    RETRIEVAL_QUERY_MAX_CHARS,
    RETRIEVAL_QUERY_MAX_WINDOWS,
    buildRetrievalQueries,
    mergeRoundRobin,
} from '../application/retrieval-query.util';

/** Транскрипт из пронумерованных предложений: границы окон проверяемы. */
function transcriptOf(sentences: number, wordsPerSentence = 12): string {
    return Array.from(
        { length: sentences },
        (_, i) =>
            Array.from(
                { length: wordsPerSentence },
                (__, j) => `слово${i}_${j}`,
            ).join(' ') + '.',
    ).join(' ');
}

describe('buildRetrievalQueries', () => {
    it('короткий транскрипт уходит одним запросом как есть', () => {
        expect(buildRetrievalQueries('  текст звонка  ')).toEqual([
            'текст звонка',
        ]);
        expect(buildRetrievalQueries('')).toEqual(['']);
    });

    it('длинный транскрипт режется на окна не длиннее лимита', () => {
        const text = transcriptOf(120); // ≈ 12 тыс. символов
        const queries = buildRetrievalQueries(text);
        expect(queries.length).toBeGreaterThan(1);
        expect(queries.length).toBeLessThanOrEqual(RETRIEVAL_QUERY_MAX_WINDOWS);
        for (const query of queries) {
            expect(query.length).toBeLessThanOrEqual(RETRIEVAL_QUERY_MAX_CHARS);
            expect(query.length).toBeGreaterThan(0);
        }
    });

    it('окна режутся по границам предложений, первое и последнее сохраняются', () => {
        const text = transcriptOf(120);
        const queries = buildRetrievalQueries(text);
        expect(queries[0].startsWith('слово0_0 ')).toBe(true);
        expect(queries[queries.length - 1].endsWith('слово119_11.')).toBe(true);
        for (const query of queries) expect(query.endsWith('.')).toBe(true);
    });

    it('без прореживания окна покрывают весь текст подряд', () => {
        const text = transcriptOf(30);
        const queries = buildRetrievalQueries(text, { maxWindows: 100 });
        expect(queries.join(' ')).toBe(text);
    });

    it('прореживание равномерное: индексы k·(n−1)/(m−1)', () => {
        const text = transcriptOf(200, 6);
        const all = buildRetrievalQueries(text, {
            maxChars: 200,
            maxWindows: 1000,
        });
        const sampled = buildRetrievalQueries(text, {
            maxChars: 200,
            maxWindows: 4,
        });
        const last = all.length - 1;
        const expected = [0, 1, 2, 3].map(k => all[Math.round((k * last) / 3)]);
        expect(sampled).toEqual(expected);
    });

    it('предложение длиннее лимита режется жёстко, ничего не теряется', () => {
        const long = 'а'.repeat(2500);
        const queries = buildRetrievalQueries(long, { maxChars: 1000 });
        expect(queries.map(q => q.length)).toEqual([1000, 1000, 500]);
        expect(queries.join('')).toBe(long);
    });

    it('абзацы — тоже граница окна', () => {
        const text = `${'первый абзац без точки'}\n\n${'второй абзац без точки'}`;
        expect(buildRetrievalQueries(text, { maxChars: 30 })).toEqual([
            'первый абзац без точки',
            'второй абзац без точки',
        ]);
    });
});

describe('mergeRoundRobin', () => {
    const keyOf = (item: string): string => item;

    it('первые результаты каждого окна идут раньше вторых', () => {
        expect(
            mergeRoundRobin(
                [
                    ['a1', 'a2'],
                    ['b1', 'b2'],
                ],
                keyOf,
                10,
            ),
        ).toEqual(['a1', 'b1', 'a2', 'b2']);
    });

    it('дубли по ключу отбрасываются, лимит соблюдается', () => {
        expect(
            mergeRoundRobin(
                [
                    ['x', 'y'],
                    ['x', 'z'],
                    ['y', 'w'],
                ],
                keyOf,
                3,
            ),
        ).toEqual(['x', 'y', 'z']);
    });

    it('пустой ключ пропускается, пустые списки не мешают', () => {
        expect(mergeRoundRobin([[], ['', 'ok']], keyOf, 5)).toEqual(['ok']);
    });
});
