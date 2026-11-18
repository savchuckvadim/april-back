import { readCallPageAnalysis } from '../call-page-analysis.reader';
import { buildCallPageFacts } from '../call-page-facts.presenter';
import { buildCallPagePointHighlights } from '../call-page-points.presenter';
import {
    buildCallPageSectionHighlights,
    presentCallPageSections,
} from '../call-page-sections.presenter';
import type {
    CallPageAnalysisView,
    CallPageSegmentView,
} from '../call-page.types';

/** Расшифровка: семь реплик по 10 секунд. */
const SEGMENTS: CallPageSegmentView[] = [
    'Добрый день, это Ирина, компания Гарант.',
    'Скажите, а какие задачи сейчас у вашей бухгалтерии?',
    'Отчётность и НДС, ещё проверяем контрагентов.',
    'Давайте покажу, как проверить контрагента в системе.',
    'Мне понравилось, удобно, всё в одном месте.',
    'За год выйдет девяносто тысяч рублей на троих.',
    'Хорошо, созвонимся в среду по решению.',
].map((text, index) => ({
    index,
    startSec: index * 10,
    endSec: index * 10 + 9,
    speaker: null,
    text,
}));

const viewOf = (analysis: Record<string, unknown>): CallPageAnalysisView => {
    const view = readCallPageAnalysis({
        callType: 'presentation',
        summary: 'Показ системы.',
        ...analysis,
    });
    if (view === null) throw new Error('разбор не прочитан');
    return view;
};

/** Разбор задания с цитатами (focus-v3.4): секунды уже проверены приёмом. */
const QUOTED = {
    sections: [
        {
            section: 'NEEDS',
            relevance: 100,
            score: 7,
            analysis: 'Выяснил задачи бухгалтерии.',
            asWas: 'Менеджер спросил о задачах бухгалтерии клиента.',
            quote: 'какие задачи сейчас у вашей бухгалтерии',
            startSec: 10,
        },
        {
            section: 'PRESENTATION',
            relevance: 100,
            score: 6,
            analysis: 'Показ под задачу.',
            asWas: 'Показал проверку контрагента.',
            quote: null,
            startSec: 30,
        },
    ],
    needsFound: true,
    needs: ['НДС', 'Проверка контрагентов'],
    needItems: [
        { need: 'НДС', quote: 'Отчётность и НДС', startSec: 20 },
        { need: 'Проверка контрагентов', quote: null, startSec: null },
    ],
    hvostDone: true,
    hvostAnalysis: 'Желание: ✓\nЧто предложили: ✓',
    hvostEvidence: [
        { key: 'desire', quote: 'Мне понравилось, удобно', startSec: 40 },
        { key: 'decisionWay', quote: 'созвонимся в среду', startSec: 60 },
    ],
    fiveKDone: false,
    fiveKAnalysis: 'Клиент: задачи бухгалтерии',
    fiveKEvidence: [],
};

describe('места пунктов разбора: потребности, «хвост», 5К (focus-v3.4)', () => {
    it('прежний разбор: пунктов нет, раздел ищется по «как было»', () => {
        const view = viewOf({
            sections: [
                {
                    section: 'NEEDS',
                    relevance: 100,
                    score: 5,
                    asWas: 'какие задачи сейчас у вашей бухгалтерии',
                },
            ],
            needsFound: true,
            needs: ['НДС'],
            hvostDone: true,
            hvostAnalysis: 'Желание: ✓',
        });

        const points = buildCallPagePointHighlights(view, SEGMENTS);
        expect(points.highlights).toEqual([]);
        expect(points.items).toEqual({ needs: [], hvost: [], fiveK: [] });
        const marks = buildCallPageSectionHighlights(view.sections, SEGMENTS);
        expect(marks.sectionIds).toEqual(['section-1']);
        expect(marks.highlights[0].segmentIndexes).toEqual([1]);

        const facts = buildCallPageFacts(view);
        expect(facts.every(fact => fact.items.length === 0)).toBe(true);
    });

    it('раздел — по цитате-доказательству, без цитаты — по секунде; цитата отдаётся разделу', () => {
        const view = viewOf(QUOTED);
        const marks = buildCallPageSectionHighlights(view.sections, SEGMENTS);

        expect(
            marks.highlights.map(item => [item.id, item.segmentIndexes]),
        ).toEqual([
            ['section-1', [1]],
            ['section-2', [3]],
        ]);
        expect(
            presentCallPageSections(view.sections, marks.sectionIds).map(
                section => [section.title, section.quote, section.highlightId],
            ),
        ).toEqual([
            [
                'Выявление потребностей',
                'какие задачи сейчас у вашей бухгалтерии',
                'section-1',
            ],
            ['Презентация под потребности', null, 'section-2'],
        ]);
    });

    it('потребности и пункты «хвоста» — свои подсветки; пункт без места — без кнопки', () => {
        const points = buildCallPagePointHighlights(viewOf(QUOTED), SEGMENTS);

        expect(
            points.highlights.map(item => [
                item.id,
                item.kind,
                item.label,
                item.segmentIndexes,
                item.startSec,
            ]),
        ).toEqual([
            ['need-1', 'need', 'НДС', [2], 20],
            ['hvost-1', 'hvost', 'Желание работать с Гарантом', [4], 40],
            ['hvost-2', 'hvost', 'Выход на решение', [6], 60],
        ]);
        expect(points.items).toEqual({
            needs: [{ label: 'НДС', tone: 'good', highlightId: 'need-1' }],
            hvost: [
                {
                    label: 'Желание работать с Гарантом',
                    tone: 'good',
                    highlightId: 'hvost-1',
                },
                {
                    label: 'Выход на решение',
                    tone: 'good',
                    highlightId: 'hvost-2',
                },
            ],
            fiveK: [],
        });
    });

    it('не презентация: мест «хвоста» и 5К нет — то же правило, что у строк чек-листов', () => {
        const points = buildCallPagePointHighlights(
            viewOf({ ...QUOTED, callType: 'refine' }),
            SEGMENTS,
        );

        expect(points.items.hvost).toEqual([]);
        expect(points.items.fiveK).toEqual([]);
        expect(points.items.needs).toHaveLength(1);
    });

    it('строки «Итогов»: у потребностей и «хвоста» — пункты с местом, у чек-листа своей кнопки нет', () => {
        const view = viewOf(QUOTED);
        const points = buildCallPagePointHighlights(view, SEGMENTS);
        const facts = buildCallPageFacts(
            view,
            {
                needs: 'moment-1',
                presentation: null,
                nextStep: null,
                price: null,
            },
            points.items,
        );
        const byLabel = new Map(facts.map(fact => [fact.label, fact]));

        expect(byLabel.get('Потребности')).toMatchObject({
            highlightId: 'moment-1',
            items: points.items.needs,
        });
        expect(byLabel.get('Чек-лист ХВОСТ')).toMatchObject({
            highlightId: null,
            items: points.items.hvost,
        });
        expect(byLabel.get('Чек-лист 5К')?.items).toEqual([]);
    });
});
