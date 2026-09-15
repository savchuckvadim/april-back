import {
    EXPLANATION_FORBIDDEN_WORDS,
    EXPLANATION_STYLE_SEPARATOR,
    renderCellExplanation,
    sectionTitle,
    styleNoteSentence,
} from '../model/explanation-template';
import { buildCellCore } from '../model/matrix-cell';
import { MatrixCellCore } from '../model/matrix.types';
import { MetricValue } from '../model/metric';
import { ratePctMetric } from '../model/metric-pct.util';
import { liteRows, section } from './lite-row.fixture';

/** σ, при котором ±интервал изменения для n = 18/22 равен ровно 0,5. */
const SD = 0.5 / (1.645 * Math.sqrt(1 / 18 + 1 / 22));

const cell: MatrixCellCore = {
    n: 18,
    nBeforeComparable: 0,
    score: {
        value: 6.4,
        n: 18,
        confidence: { level: 'low', reason: 'few-data' },
    },
    scoreSd: SD,
    sections: [
        { section: 'PRICE', avgScore: 4.2, n: 11, avgRelevance: 60 },
        { section: 'GREETING', avgScore: 8.1, n: 18, avgRelevance: 90 },
        { section: 'CLOSING', avgScore: null, n: 5, avgRelevance: 70 },
    ],
    checklists: { nextStepDateRatePct: ratePctMetric(10, 18) },
    evidenceCallIds: { best: 't-best', worst: 't-worst', median: 't-med' },
    versionsMixed: false,
};

const previous: MetricValue = {
    value: 7.3,
    n: 22,
    confidence: { level: 'ok' },
};

const containsForbidden = (text: string): boolean =>
    EXPLANATION_FORBIDDEN_WORDS.some(word => text.toLowerCase().includes(word));

describe('renderCellExplanation', () => {
    it('шаблон плана: оценка, сильно, слабо, изменение с ±, команда, один совет', () => {
        const result = renderCellExplanation(cell, {
            teamMedian: 6,
            previous,
            previousSd: SD,
        });
        expect(result.text).toBe(
            'Оценка 6,4/10 (n = 18). Сильно: приветствие 8,1 (n = 18). ' +
                'Слабо: работа по цене 4,2 (n = 11). Изменение −0,9 (n = 18/22; ±0,5). ' +
                'Команда: медиана 6,0. Совет: разобрать «работа по цене» на звонке t-worst.',
        );
        expect(result.basis).toEqual([
            'score=6.4',
            'n=18',
            'strong=GREETING:8.1:n=18',
            'weak=PRICE:4.2:n=11',
            'delta=-0.9',
            'n_prev=22',
            'halfwidth=0.5',
            'team_median=6.0',
            'evidence=best:t-best;worst:t-worst;median:t-med',
        ]);
    });

    it('каждое число текста есть в basis', () => {
        const { basis } = renderCellExplanation(cell, {
            teamMedian: 6,
            previous,
            previousSd: SD,
        });
        const joined = basis.join(' ');
        for (const number of [
            '6.4',
            '18',
            '8.1',
            '4.2',
            '11',
            '0.9',
            '22',
            '0.5',
            '6.0',
        ]) {
            expect(joined).toContain(number);
        }
    });

    it('confidence none → «мало данных (n = …)» и только n в basis', () => {
        const thin: MatrixCellCore = {
            ...cell,
            n: 5,
            score: {
                value: null,
                n: 5,
                confidence: { level: 'none', reason: 'not-enough-data' },
            },
            scoreSd: null,
        };
        expect(renderCellExplanation(thin)).toEqual({
            text: 'мало данных (n = 5)',
            basis: ['n=5'],
        });
    });

    it('без прошлого периода — «нет сравнимой истории»; прошлый none — «мало данных»', () => {
        expect(renderCellExplanation(cell).text).toContain(
            'Изменение: нет сравнимой истории.',
        );
        const thinPrevious: MetricValue = {
            value: null,
            n: 4,
            confidence: { level: 'none', reason: 'not-enough-data' },
        };
        const result = renderCellExplanation(cell, { previous: thinPrevious });
        expect(result.text).toContain(
            'Изменение: мало данных за прошлый период (n = 4).',
        );
        expect(result.basis).toContain('n_prev=4');
    });

    it('изменение внутри ±интервала помечается «в пределах разброса», без σ — без ±', () => {
        const small = renderCellExplanation(cell, {
            previous: { value: 6.6, n: 22, confidence: { level: 'ok' } },
            previousSd: SD,
        });
        expect(small.text).toContain(
            'Изменение −0,2 (n = 18/22; ±0,5) — в пределах разброса.',
        );
        const noSd = renderCellExplanation(cell, { previous });
        expect(noSd.text).toContain('Изменение −0,9 (n = 18/22).');
        expect(noSd.basis).not.toContain(expect.stringContaining('halfwidth'));
    });

    it('один оценённый раздел → «Раздел:», ни одного → подсказка про n ≥ 8', () => {
        const single = renderCellExplanation({
            ...cell,
            sections: [cell.sections[0]],
        });
        expect(single.text).toContain('Раздел: работа по цене 4,2 (n = 11).');
        expect(single.basis).toContain('section=PRICE:4.2:n=11');
        const none = renderCellExplanation({ ...cell, sections: [] });
        expect(none.text).toContain('Разделы: нет оценённых (нужно n ≥ 8).');
        expect(none.text).toContain(
            'Совет: накопить разборы, чтобы увидеть разделы.',
        );
    });

    it('без худшего звонка совет указывает на ближайшие звонки', () => {
        const result = renderCellExplanation({
            ...cell,
            evidenceCallIds: { best: null, worst: null, median: null },
        });
        expect(result.text).toContain('на ближайших звонках.');
    });

    it('слово «значимо» не встречается ни в одном варианте', () => {
        const variants = [
            renderCellExplanation(cell, {
                teamMedian: 6,
                previous,
                previousSd: SD,
            }),
            renderCellExplanation(cell, {
                previous: { value: 6.6, n: 22, confidence: { level: 'ok' } },
                previousSd: SD,
            }),
            renderCellExplanation(cell),
            renderCellExplanation({ ...cell, sections: [] }),
            renderCellExplanation({
                ...cell,
                score: { value: null, n: 3, confidence: { level: 'none' } },
            }),
        ];
        for (const variant of variants) {
            expect(containsForbidden(variant.text)).toBe(false);
            expect(containsForbidden(variant.basis.join(' '))).toBe(false);
        }
    });

    it('работает на ячейке, собранной buildCellCore из строк', () => {
        const rows = liteRows('r', 9, {
            sections: [section('GREETING', 9), section('PRICE', 3)],
        });
        const built = buildCellCore(rows, 0);
        const result = renderCellExplanation(built);
        expect(result.text).toContain('Оценка 7,0/10 (n = 9).');
        expect(result.text).toContain('Сильно: приветствие 9,0 (n = 9).');
        expect(result.text).toContain('Слабо: работа по цене 3,0 (n = 9).');
        expect(result.text).toContain('на звонке r1.');
    });

    it('подпись раздела строчными, неизвестный код — как есть', () => {
        expect(sectionTitle('NEEDS')).toBe('выявление потребностей');
        expect(sectionTitle('CUSTOM')).toBe('CUSTOM');
    });
});

describe('renderCellExplanation: разделитель «Независимо от стиля»', () => {
    it('факт о манере идёт отдельным предложением перед советом', () => {
        const result = renderCellExplanation(cell, {
            previous,
            previousSd: SD,
            styleNote: 'по разборам он чаще показывает решение до вопросов',
        });

        expect(result.text).toContain(
            `${EXPLANATION_STYLE_SEPARATOR}: по разборам он чаще показывает ` +
                'решение до вопросов.',
        );
        expect(result.text.indexOf(EXPLANATION_STYLE_SEPARATOR)).toBeLessThan(
            result.text.indexOf('Совет:'),
        );
        expect(result.basis).toContain('style=note');
    });

    it('без стиля текст и опоры прежние (разделителя нет)', () => {
        const withStyle = renderCellExplanation(cell, {
            previous,
            previousSd: SD,
            styleNote: null,
        });
        const plain = renderCellExplanation(cell, {
            previous,
            previousSd: SD,
        });

        expect(withStyle).toEqual(plain);
        expect(plain.text).not.toContain(EXPLANATION_STYLE_SEPARATOR);
        expect(plain.basis).not.toContain('style=note');
    });

    it('пустая заметка разделителя не печатает, точка не удваивается', () => {
        expect(styleNoteSentence('   ')).toBeNull();
        expect(
            styleNoteSentence('чаще коллег возвращается после переноса.'),
        ).toBe(
            `${EXPLANATION_STYLE_SEPARATOR}: чаще коллег возвращается после переноса.`,
        );
    });

    it('запрещённое слово не появляется и в варианте со стилем', () => {
        const result = renderCellExplanation(cell, {
            styleNote: 'чаще коллег задаёт ход разговора',
        });

        expect(containsForbidden(result.text)).toBe(false);
    });
});
