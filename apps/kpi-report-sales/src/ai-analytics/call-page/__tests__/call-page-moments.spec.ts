import { readCallPageAnalysis } from '../call-page-analysis.reader';
import { buildCallPageHighlights } from '../call-page-highlights.presenter';
import type {
    CallPageAnalysisView,
    CallPageSegmentView,
} from '../call-page.types';

/** Расшифровка: шесть реплик по 10 секунд. */
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

const viewOf = (analysis: Record<string, unknown>): CallPageAnalysisView => {
    const view = readCallPageAnalysis({
        callType: 'presentation',
        summary: 'Показ системы.',
        ...analysis,
    });
    if (view === null) throw new Error('разбор не прочитан');
    return view;
};

/**
 * Время в звонке из разбора focus-v3.2: у сбоев и цен — точное место, у хода
 * разговора — три момента (потребности, презентация, следующий шаг).
 */
describe('подсветки страницы звонка: время из разбора', () => {
    it('моменты разговора — отдельная группа по порядку времени, с привязкой к реплике', () => {
        const { highlights } = buildCallPageHighlights(
            viewOf({
                needsStartSec: 12,
                presentationStartSec: 31,
                nextStep: {
                    set: true,
                    description: 'Созвон в среду в 11:00',
                    startSec: 52,
                },
            }),
            SEGMENTS,
        );

        const moments = highlights.filter(item => item.kind === 'moment');
        expect(
            moments.map(item => [
                item.label,
                item.startSec,
                item.segmentIndexes,
            ]),
        ).toEqual([
            ['Выяснение потребностей', 10, [1]],
            ['Начало презентации', 30, [3]],
            ['Договорённость о следующем шаге', 50, [5]],
        ]);
        expect(moments[0]).toMatchObject({
            id: 'moment-1',
            kindTitle: 'Ход разговора',
            tone: 'neutral',
            quote: null,
        });
        expect(moments[2]?.note).toBe('Созвон в среду в 11:00');
    });

    it('старый разбор без времени: моментов нет, остальные подсветки как раньше — по цитате', () => {
        const { highlights } = buildCallPageHighlights(
            viewOf({
                nextStep: { set: true, description: 'Созвон в среду' },
                prices: [
                    {
                        amount: 90000,
                        periodMonths: 12,
                        kind: 'list',
                        quote: 'За год выйдет девяносто тысяч рублей.',
                    },
                ],
            }),
            SEGMENTS,
        );

        expect(highlights.some(item => item.kind === 'moment')).toBe(false);
        expect(highlights.find(item => item.kind === 'price')).toMatchObject({
            segmentIndexes: [4],
            startSec: 40,
        });
    });

    it('следующий шаг не назначен — момента нет, даже если время пришло', () => {
        const { highlights } = buildCallPageHighlights(
            viewOf({ nextStep: { set: false, startSec: 52 } }),
            SEGMENTS,
        );

        expect(highlights).toEqual([]);
    });

    it('сбой и цена с пересказанной цитатой находятся по времени из разбора', () => {
        const { highlights } = buildCallPageHighlights(
            viewOf({
                issues: [
                    {
                        code: 'crm_repeat_refused',
                        quote: 'клиент сказал, что уже отказывался',
                        note: 'Звонили после отказа',
                        startSec: 21,
                        endSec: 28,
                    },
                ],
                prices: [
                    {
                        amount: 90000,
                        periodMonths: 12,
                        kind: 'list',
                        quote: 'девяносто тысяч',
                        startSec: 41,
                    },
                ],
            }),
            SEGMENTS,
        );

        expect(highlights.find(item => item.kind === 'issue')).toMatchObject({
            label: 'Повторный звонок отказавшему',
            segmentIndexes: [2],
            startSec: 20,
        });
        expect(highlights.find(item => item.kind === 'price')).toMatchObject({
            startSec: 40,
        });
    });
});
