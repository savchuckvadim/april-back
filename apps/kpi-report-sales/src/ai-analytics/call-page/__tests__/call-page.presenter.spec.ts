import type { TranscriptSegment } from '@lib/call-lib';
import { readCallPageAnalysis } from '../call-page-analysis.reader';
import { presentCallPage, type CallPageSource } from '../call-page.presenter';
import type { CallPageAnalysisView } from '../call-page.types';

const SEGMENTS: TranscriptSegment[] = [
    {
        startSec: 0,
        endSec: 6,
        speaker: 'unknown',
        text: 'Добрый день, это Ирина, компания Гарант.',
    },
    {
        startSec: 7,
        endSec: 12,
        speaker: 'unknown',
        text: 'Хотела показать вам нашу систему.',
    },
    {
        startSec: 13,
        endSec: 19,
        speaker: 'unknown',
        text: 'Нет, спасибо, это дорого для нас.',
    },
    {
        startSec: 20,
        endSec: 27,
        speaker: 'unknown',
        text: 'Могу сделать скидку десять процентов.',
    },
    {
        startSec: 28,
        endSec: 34,
        speaker: 'unknown',
        text: 'Стоимость сто двадцать тысяч в год.',
    },
    {
        startSec: 35,
        endSec: 41,
        speaker: 'unknown',
        text: 'Вы мне уже звонили на прошлой неделе.',
    },
];

const ANALYSIS = {
    callType: 'cold',
    callTypeReason: 'Первый контакт.',
    summary: 'Клиент отказался из-за цены.',
    score: 4,
    weightedScore: 41,
    scriptCompliance: 60,
    scoreExplanation: 'Скидка без выяснения причины.',
    coachingPriority: 'urgent',
    recommendations: ['Выяснять причину возражения.'],
    employeeRecommendations: 'Потренировать работу с ценой.',
    sentiment: 'negative',
    interlocutorRole: 'lpr',
    specialist: 'accountant',
    outcome: 'refused',
    needsFound: false,
    presentationDone: true,
    productsOffered: ['Гарант Бухгалтер'],
    priceDiscussed: true,
    competitors: ['неизвестный-код'],
    riskFlags: ['conflict', 'promise'],
    riskEvidence: [
        {
            flag: 'conflict',
            quote: 'Вы мне уже звонили',
            speaker: 'client',
            startSec: 35,
            endSec: 41,
        },
        {
            flag: 'promise',
            quote: 'Могу сделать скидку',
            speaker: 'manager',
            startSec: 20,
            endSec: 27,
        },
    ],
    refusalCategory: 'price',
    refusalReason: 'Дорого.',
    talkRatioPct: 64.4,
    questionsCount: 0,
    nextStep: { set: false },
    dealProgress: {
        score: 1,
        before: 'Новый',
        after: 'Отказ',
        why: 'Клиент отказался.',
    },
    sections: [
        {
            section: 'OBJECTIONS',
            relevance: 100,
            score: 3,
            analysis: 'Скидка сразу.',
            advice: 'Уточнить причину.',
            asWas: 'Могу сделать скидку десять процентов',
        },
        {
            section: 'PRESENTATION',
            relevance: 80,
            score: 2,
            analysis: 'Без потребностей.',
            asWas: 'Хотела показать вам нашу систему',
        },
        {
            section: 'GREETING',
            relevance: 0,
            score: 9,
            analysis: 'Не относится.',
        },
    ],
    objections: [
        {
            objection: 'Дорого',
            category: 'price',
            handled: false,
            handling: 'other',
            quote: 'это дорого для нас',
            outcome: 'disengaged',
            reaction: 'other',
            startSec: 13,
            endSec: 19,
        },
    ],
    issues: [
        {
            code: 'crm_duplicate',
            quote: 'Вы мне уже звонили на прошлой неделе',
            note: 'Повторный звонок.',
        },
    ],
    prices: [
        {
            amount: 120000,
            periodMonths: 12,
            kind: 'list',
            product: 'Гарант Бухгалтер',
            quote: 'Стоимость сто двадцать тысяч в год',
        },
    ],
    methodology: {
        title: 'Методика продаж',
        checkpointsDone: 1,
        checkpointsTotal: 2,
        spiralsFull: 0,
        spiralsMinFull: 3,
        checkpoints: [
            {
                title: 'Представился',
                status: 'done',
                mandatory: true,
                quote: 'это Ирина, компания Гарант',
                startSec: 0,
                endSec: 6,
            },
            {
                title: 'Выявил потребность',
                status: 'missed',
                mandatory: true,
                quote: null,
                startSec: null,
                endSec: null,
            },
            {
                title: 'Работа с договором',
                status: 'not_applicable',
                mandatory: false,
                quote: null,
            },
        ],
    },
    incompleteParts: ['movement'],
};

const viewOf = (payload: unknown): CallPageAnalysisView => {
    const view = readCallPageAnalysis(payload);
    if (view === null) throw new Error('разбор не прочитан');
    return view;
};

const sourceOf = (overrides: Partial<CallPageSource> = {}): CallPageSource => ({
    call: {
        startedAt: new Date('2026-11-12T09:41:00.000Z'),
        durationSec: '412',
        segments: SEGMENTS,
        text: SEGMENTS.map(segment => segment.text).join(' '),
        hasAudio: true,
    },
    view: viewOf(ANALYSIS),
    managerName: 'Иванова Ирина',
    smartUrl: 'https://portal.bitrix24.ru/crm/type/1040/details/512/',
    crmUrl: 'https://portal.bitrix24.ru/crm/deal/details/9041/',
    ...overrides,
});

/** toLocaleString('ru-RU') разделяет тысячи неразрывным пробелом. */
const plain = (value: string): string => value.replace(/\s/g, ' ');

describe('страница разбора звонка: сборка карточки', () => {
    const page = presentCallPage(sourceOf());

    it('шапка: менеджер, время, длительность, тип звонка словами', () => {
        expect(page.call).toEqual({
            managerName: 'Иванова Ирина',
            startedAt: '2026-11-12T09:41:00.000Z',
            durationSec: 412,
            callTypeTitle: expect.stringMatching(/холодн/i) as string,
            callTypeReason: 'Первый контакт.',
            hasAudio: true,
            smartUrl: 'https://portal.bitrix24.ru/crm/type/1040/details/512/',
            crmUrl: 'https://portal.bitrix24.ru/crm/deal/details/9041/',
        });
    });

    it('оценка, приоритет разбора и пометка о неполном разборе', () => {
        expect(page.score.score).toBe(4);
        expect(page.score.weightedScore).toBe(41);
        expect(page.score.coachingTitle).toBe('Срочно на разбор');
        expect(page.score.incompleteNote).toMatch(/неполный/);
    });

    it('итоги разговора — словами, без кодов; незнакомый код не показан', () => {
        const facts = new Map(page.facts.map(item => [item.label, item]));
        expect(facts.get('Результат звонка')).toEqual({
            label: 'Результат звонка',
            value: 'Отказ',
            tone: 'bad',
            highlightId: null,
            items: [],
        });
        expect(facts.get('Собеседник')?.value).toBe('ЛПР, Бухгалтер');
        expect(facts.get('Потребности')).toMatchObject({
            value: 'не выявлены',
            tone: 'bad',
        });
        expect(facts.get('Следующий шаг')).toMatchObject({
            value: 'не назначен',
            tone: 'warn',
        });
        expect(plain(facts.get('Цена')?.value ?? '')).toBe(
            '120 000 ₽ за 12 мес. — Гарант Бухгалтер',
        );
        expect(facts.get('Продвижение сделки')?.value).toBe(
            '1 из 5. Новый → Отказ. Клиент отказался.',
        );
        expect(facts.get('Доля речи менеджера')?.value).toBe('64 %');
        expect(facts.has('Конкуренты')).toBe(false);
        expect(JSON.stringify(page.facts)).not.toMatch(
            /refused|lpr|accountant/,
        );
    });

    it('разделы — только относящиеся к звонку', () => {
        expect(page.sections.map(section => section.title)).toEqual([
            'Работа с возражениями',
            'Презентация под потребности',
        ]);
    });

    it('раздел с найденной цитатой «как было» ссылается на свою подсветку, бейджем она не выводится', () => {
        expect(
            page.sections.map(section => [section.title, section.highlightId]),
        ).toEqual([
            ['Работа с возражениями', 'section-1'],
            ['Презентация под потребности', 'section-2'],
        ]);
        expect(page.sectionHighlights).toEqual([
            expect.objectContaining({
                id: 'section-1',
                kind: 'section',
                label: 'Работа с возражениями',
                tone: 'bad',
                segmentIndexes: [3],
                startSec: 20,
            }),
            expect.objectContaining({ id: 'section-2', segmentIndexes: [1] }),
        ]);
        // В группы бейджей (highlights) вид «раздел» не попадает.
        expect(page.highlights.some(item => item.kind === 'section')).toBe(
            false,
        );
    });

    it('итоги: цена ссылается на подсветку цены, без подсветки — null', () => {
        const facts = new Map(page.facts.map(item => [item.label, item]));
        expect(facts.get('Цена')?.highlightId).toBe('price-1');
        expect(facts.get('Потребности')?.highlightId).toBeNull();
        expect(facts.get('Следующий шаг')?.highlightId).toBeNull();
        expect(page.highlights.map(item => item.id)).toContain('price-1');
    });

    it('возражение: подписи словами и своя подсветка в расшифровке', () => {
        expect(page.objections).toEqual([
            {
                text: 'Дорого',
                categoryTitle: 'Цена',
                handled: false,
                handling: 'иное или не отреагировал',
                quote: 'это дорого для нас',
                outcomeTitle: 'клиент ушёл из разговора',
                highlightId: 'objection-1',
            },
        ]);
        const highlight = page.highlights.find(
            item => item.id === 'objection-1',
        );
        expect(highlight).toMatchObject({
            kind: 'objection',
            kindTitle: 'Возражения',
            label: 'Цена: Дорого',
            tone: 'bad',
            segmentIndexes: [2],
            startSec: 13,
        });
    });

    it('методика: статусы словами, пункт без цитаты — без подсветки', () => {
        expect(page.methodology?.checkpointsDone).toBe(1);
        expect(page.methodology?.checkpointsTotal).toBe(2);
        expect(page.methodology?.spiralsNote).toMatch(/0 из 3 нужных/);
        expect(
            page.methodology?.checkpoints.map(item => [
                item.statusTitle,
                item.highlightId,
            ]),
        ).toEqual([
            ['Выполнен', 'methodology-1'],
            ['Пропущен', null],
            ['Не относится к звонку', null],
        ]);
    });

    it('подсветки: ошибка менеджера, действующий риск, сбой и цена привязаны к репликам', () => {
        const byKind = (kind: string) =>
            page.highlights.filter(item => item.kind === kind);
        expect(byKind('signal')).toEqual([
            expect.objectContaining({
                label: 'Презентация без выявленных потребностей',
                tone: 'bad',
                segmentIndexes: [1],
            }),
        ]);
        // Отменённый флаг «обещание клиенту» в подсветки не идёт.
        expect(byKind('risk')).toEqual([
            expect.objectContaining({
                note: 'Слова клиента',
                segmentIndexes: [5],
                startSec: 35,
            }),
        ]);
        expect(byKind('issue')).toEqual([
            expect.objectContaining({
                label: 'Дубль в CRM: клиенту уже звонил другой менеджер',
                tone: 'warn',
                segmentIndexes: [5],
            }),
        ]);
        expect(byKind('price')).toEqual([
            expect.objectContaining({ segmentIndexes: [4], startSec: 28 }),
        ]);
    });

    it('расшифровка — по репликам со временем; говорящий неизвестен', () => {
        expect(page.transcriptTimed).toBe(true);
        expect(page.transcript).toHaveLength(6);
        expect(page.transcript[2]).toEqual({
            index: 2,
            startSec: 13,
            endSec: 19,
            speaker: null,
            text: 'Нет, спасибо, это дорого для нас.',
        });
    });

    it('пустой разбор: страница собирается, списки пустые', () => {
        const empty = presentCallPage(
            sourceOf({
                view: viewOf({}),
                call: {
                    startedAt: null,
                    durationSec: null,
                    segments: null,
                    text: 'Первая реплика.\nВторая реплика.',
                    hasAudio: false,
                },
                managerName: null,
                smartUrl: null,
                crmUrl: null,
            }),
        );
        expect(empty.call.callTypeTitle).toBeNull();
        expect(empty.call.durationSec).toBeNull();
        expect(empty.score.incompleteNote).toBeNull();
        expect(empty.facts).toEqual([]);
        expect(empty.sections).toEqual([]);
        expect(empty.highlights).toEqual([]);
        expect(empty.sectionHighlights).toEqual([]);
        expect(empty.methodology).toBeNull();
        expect(empty.transcriptTimed).toBe(false);
        expect(empty.transcript.map(segment => segment.text)).toEqual([
            'Первая реплика.',
            'Вторая реплика.',
        ]);
    });

    it('нагрузка разбора не объект — разбора нет', () => {
        expect(readCallPageAnalysis(null)).toBeNull();
        expect(readCallPageAnalysis('текст')).toBeNull();
        expect(readCallPageAnalysis([1, 2])).toBeNull();
    });
});
