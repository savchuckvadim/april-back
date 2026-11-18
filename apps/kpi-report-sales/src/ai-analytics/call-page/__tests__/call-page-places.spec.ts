import { readCallPageAnalysis } from '../call-page-analysis.reader';
import { buildCallPageFacts } from '../call-page-facts.presenter';
import { buildCallPageHighlights } from '../call-page-highlights.presenter';
import { buildCallPageSectionHighlights } from '../call-page-sections.presenter';
import type {
    CallPageAnalysisView,
    CallPageSegmentView,
} from '../call-page.types';

/** Расшифровка: шесть реплик по 10 секунд, запись — 60 секунд. */
const SEGMENTS: CallPageSegmentView[] = [
    'Добрый день, это Ирина, компания Гарант.',
    'Скажите, откуда вы сейчас берёте судебную практику?',
    'Ищем в интернете, уходит много времени.',
    'Тогда покажу, как это делается в системе.',
    'За год выйдет девяносто тысяч рублей.',
    'Давайте созвонимся в среду в одиннадцать.',
].map((text, index) => ({
    index,
    startSec: index * 10,
    endSec: index * 10 + 9,
    speaker: null,
    text,
}));
const DURATION = 60;

const viewOf = (analysis: Record<string, unknown>): CallPageAnalysisView => {
    const view = readCallPageAnalysis({
        callType: 'presentation',
        summary: 'Показ системы.',
        ...analysis,
    });
    if (view === null) throw new Error('разбор не прочитан');
    return view;
};

const objection = (quote: string, startSec: number | null) => ({
    objection: 'Ищут сами',
    category: 'hidden',
    handled: false,
    quote,
    startSec,
});

/**
 * Решение владельца 18.11.2026: нет уверенности в месте — нет кнопки
 * «Показать в разговоре» (лучше без неё, чем в начало или за конец записи).
 */
describe('страница звонка: проверка места перед показом', () => {
    it('цитата нашлась по тексту — место по тексту, а не по времени модели', () => {
        const { highlights, objectionIds } = buildCallPageHighlights(
            viewOf({
                objections: [
                    objection('Ищем в интернете, уходит много времени', 55),
                ],
            }),
            SEGMENTS,
            DURATION,
        );

        expect(objectionIds).toEqual(['objection-1']);
        expect(highlights[0]).toMatchObject({
            segmentIndexes: [2],
            startSec: 20,
        });
    });

    it('цитата не нашлась, но её слова звучат рядом со временем — место по времени', () => {
        const { highlights } = buildCallPageHighlights(
            viewOf({
                objections: [
                    objection('ищем всё в интернете, много времени уходит', 23),
                ],
            }),
            SEGMENTS,
            DURATION,
        );

        expect(highlights[0]).toMatchObject({
            segmentIndexes: [2],
            startSec: 20,
        });
    });

    it('цитата не нашлась и рядом её слов нет — ни подсветки, ни highlightId', () => {
        const view = viewOf({
            objections: [objection('клиент сказал, что уже отказывался', 21)],
            issues: [
                {
                    code: 'crm_repeat_refused',
                    quote: 'клиент сказал, что уже отказывался',
                    startSec: 21,
                },
            ],
        });
        const { highlights, objectionIds } = buildCallPageHighlights(
            view,
            SEGMENTS,
            DURATION,
        );

        expect(highlights).toEqual([]);
        expect(objectionIds).toEqual([null]);
    });

    it('время за концом записи — неизвестно: цена по тексту остаётся, без цитаты в тексте — пропадает', () => {
        const view = viewOf({
            priceDiscussed: true,
            prices: [
                {
                    amount: 90000,
                    periodMonths: 12,
                    quote: 'этой цены в разговоре не было вовсе',
                    startSec: 2452,
                },
                {
                    amount: 90000,
                    periodMonths: 12,
                    quote: 'девяносто тысяч рублей',
                    startSec: 2452,
                },
            ],
            nextStep: {
                set: true,
                description: 'Созвон в среду',
                startSec: 2709,
            },
        });
        const { highlights, factIds } = buildCallPageHighlights(
            view,
            SEGMENTS,
            DURATION,
        );

        expect(highlights.map(item => [item.id, item.startSec])).toEqual([
            ['price-1', 40],
        ]);
        expect(factIds.nextStep).toBeNull();
        expect(factIds.price).toBe('price-1');
    });

    it('момент на нулевой секунде или за концом записи — места нет, строка итогов без highlightId', () => {
        const view = viewOf({
            presentationDone: true,
            presentationStartSec: 0,
            needsFound: false,
            needsStartSec: 61.5,
            nextStep: { set: true, description: 'Созвон', startSec: 52 },
        });
        const { highlights, factIds } = buildCallPageHighlights(
            view,
            SEGMENTS,
            DURATION,
        );

        expect(highlights.map(item => item.label)).toEqual([
            'Договорённость о следующем шаге',
        ]);
        expect(factIds).toMatchObject({
            needs: null,
            presentation: null,
            nextStep: 'moment-1',
        });
        const facts = new Map(
            buildCallPageFacts(view, factIds).map(item => [
                item.label,
                item.highlightId,
            ]),
        );
        expect(facts.get('Показ')).toBeNull();
        expect(facts.get('Потребности')).toBeNull();
        expect(facts.get('Следующий шаг')).toBe('moment-1');
    });

    it('без длительности звонка предел — конец последней реплики', () => {
        const { highlights } = buildCallPageHighlights(
            viewOf({ presentationStartSec: 75 }),
            SEGMENTS,
        );

        expect(highlights).toEqual([]);
    });

    it('раздел с цитатой не из разговора и секундой за концом записи — без подсветки', () => {
        const view = viewOf({
            sections: [
                {
                    section: 'needs',
                    relevance: 1,
                    score: 4,
                    analysis: 'Потребности не выяснены.',
                    quote: 'расскажите про ваши задачи подробнее',
                    startSec: 900,
                },
            ],
        });
        const { highlights, sectionIds } = buildCallPageSectionHighlights(
            view.sections,
            SEGMENTS,
            DURATION,
        );

        expect(highlights).toEqual([]);
        expect(sectionIds).toEqual([null]);
    });
});

describe('страница звонка: в итогах нет «null»', () => {
    const nextStepValue = (nextStep: Record<string, unknown>): string =>
        buildCallPageFacts(viewOf({ nextStep })).find(
            item => item.label === 'Следующий шаг',
        )?.value ?? '';

    it('время шага «null» словом или пусто — только дата, без «в …»', () => {
        const step = {
            set: true,
            description: 'Созвон после отпуска.',
            date: '2026-12-01',
        };

        expect(nextStepValue({ ...step, time: 'null' })).toBe(
            'Созвон после отпуска, 01.12.2026',
        );
        expect(nextStepValue({ ...step, time: null })).toBe(
            'Созвон после отпуска, 01.12.2026',
        );
        expect(nextStepValue({ ...step, time: '11:00' })).toBe(
            'Созвон после отпуска, 01.12.2026 в 11:00',
        );
    });

    it('«null» и «undefined» словами нигде в строках итогов не выводятся', () => {
        const facts = buildCallPageFacts(
            viewOf({
                outcome: 'null',
                needsFound: true,
                needs: ['null', 'судебная практика'],
                productsOffered: ['undefined'],
                refusalReason: 'null',
                reportComparison: 'undefined',
                nextStep: {
                    set: true,
                    description: 'null',
                    date: 'null',
                    time: 'null',
                },
            }),
        );

        expect(
            facts.filter(item => /null|undefined/i.test(item.value)),
        ).toEqual([]);
        expect(facts.find(item => item.label === 'Потребности')?.value).toBe(
            'судебная практика',
        );
        expect(facts.find(item => item.label === 'Следующий шаг')?.value).toBe(
            'назначен',
        );
    });
});
