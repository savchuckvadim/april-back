import {
    parseArticleBlocks,
    readStoredBlocks,
    type SiteArticleBlocksResult,
} from '../domain/site-article-content.parse';
import { SITE_ARTICLE_LIMITS } from '../domain/site-article.const';

/** Глава формата theory-v1 из всех основных видов блоков сайта. */
const THEORY_CHAPTER: unknown[] = [
    { kind: 'lead', text: 'Зачем разбирать звонки' },
    { kind: 'heading', text: 'Как устроен разбор', id: 'how-it-works' },
    { kind: 'paragraph', text: 'Текст абзаца' },
    { kind: 'obvious', intuition: 'a', reality: 'b', consequence: 'c' },
    {
        kind: 'discourse',
        question: 'Кто решает?',
        positions: [{ who: 'Менеджер', text: 'Я' }],
        price: 'Конфликт',
        preview: { mode: 'x' },
    },
    { kind: 'practice', text: 'Как бывает' },
    { kind: 'danger', text: 'Риск' },
    {
        kind: 'scenario',
        title: 'Если',
        options: [{ label: 'a', meaning: 'b' }],
    },
    {
        kind: 'screen',
        label: 'Отчёт KPI',
        aspect: '16:9',
        screenId: 'scr-kpi',
        src: '/img/kpi.png',
    },
    { kind: 'table', head: ['A', 'B'], rows: [['1', '2']], caption: 'Таблица' },
    { kind: 'steps', items: [{ title: 'Шаг', text: 'Сделать' }] },
    { kind: 'list', items: ['раз', 'два'], ordered: true },
    { kind: 'note', tone: 'warn', text: 'Внимание' },
    { kind: 'diagram', chart: 'graph TD; A-->B' },
    { kind: 'code', lang: 'json', code: '{}' },
    { kind: 'glossary', items: [{ term: 'KPI', definition: '...' }] },
    {
        kind: 'links',
        items: [{ label: 'PDF', href: '/a.pdf', download: true }],
    },
    { kind: 'questionnaire', questionnaireId: 'calibration' },
    { kind: 'readiness', state: 'wip', text: 'В работе' },
    { kind: 'benefit', feature: 'f', meaning: 'm', gain: 'g' },
    { kind: 'entities', title: 't', intro: 'i', columns: [{ label: 'Лид' }] },
    { kind: 'checklist', title: 't', intro: 'i', items: [{ question: 'q' }] },
    { kind: 'media', slot: 'scr-kpi-pulse', aspect: 'phone' },
];

const problemsOf = (result: SiteArticleBlocksResult): string[] =>
    result.ok ? [] : result.problems.map(problem => problem.message);

describe('проверка блоков статьи', () => {
    it('глава из всех видов theory-v1 проходит и возвращается как есть', () => {
        const result = parseArticleBlocks('theory-v1', THEORY_CHAPTER);
        expect(problemsOf(result)).toEqual([]);
        expect(result.ok && result.blocks).toEqual(THEORY_CHAPTER);
    });

    it('how-v1: вид в поле type, свои виды и значения', () => {
        const result = parseArticleBlocks('how-v1', [
            { type: 'cards', columns: 3, items: [{ title: 'a', text: 'b' }] },
            { type: 'note', tone: 'info', text: 'x' },
            { type: 'story', tag: 'кейс', text: 'y' },
        ]);
        expect(problemsOf(result)).toEqual([]);
        expect(
            problemsOf(
                parseArticleBlocks('how-v1', [{ kind: 'lead', text: 'x' }]),
            ),
        ).toEqual(['Блок 1: не указан вид блока (поле «type»)']);
        expect(
            problemsOf(
                parseArticleBlocks('how-v1', [
                    { type: 'cards', columns: 4, items: [{}] },
                ]),
            ),
        ).toEqual(['Блок 1 (cards): поле «columns» — одно из: 2, 3']);
    });

    it.each([
        ['не список', { kind: 'lead' }, 'Блоки статьи — это список'],
        ['блок не объект', ['текст'], 'Блок 1: ожидается объект'],
        [
            'неизвестный вид',
            [{ kind: 'video' }],
            'Блок 1: неизвестный вид «video»',
        ],
        [
            'нет вида',
            [{ text: 'x' }],
            'Блок 1: не указан вид блока (поле «kind»)',
        ],
        [
            'пустой текст',
            [{ kind: 'lead', text: '   ' }],
            'поле «text» — обязательный непустой текст',
        ],
        [
            'тон не из списка',
            [{ kind: 'note', tone: 'info', text: 'x' }],
            'одно из: good, warn, bad, neutral',
        ],
        [
            'пустой список',
            [{ kind: 'list', items: [] }],
            'непустой список строк',
        ],
        [
            'список не строк',
            [{ kind: 'list', items: [1] }],
            'непустой список строк',
        ],
        [
            'строки таблицы',
            [{ kind: 'table', head: ['a'], rows: [['1', 2]] }],
            'список строк таблицы',
        ],
        [
            'элементы шагов не объекты',
            [{ kind: 'steps', items: ['a'] }],
            'непустой список объектов',
        ],
        [
            'ordered не да/нет',
            [{ kind: 'list', items: ['a'], ordered: 'yes' }],
            'да или нет',
        ],
        [
            'якорь с пробелом',
            [{ kind: 'heading', text: 'x', id: 'Как так' }],
            'якорь',
        ],
        [
            'место медиа не по шаблону',
            [{ kind: 'media', slot: 'Scr_1' }],
            'место медиа',
        ],
        [
            'чужой адрес картинки',
            [{ kind: 'screen', label: 'x', src: '//evil.ru/a.png' }],
            'путь на сайте',
        ],
        [
            'адрес картинки со схемой',
            [{ kind: 'screen', label: 'x', src: 'javascript:alert(1)' }],
            'путь на сайте',
        ],
        [
            'число бесконечно',
            [{ kind: 'lead', text: 'x', extra: Infinity }],
            'число должно быть конечным',
        ],
        [
            'дата вместо JSON',
            [{ kind: 'lead', text: 'x', at: new Date() }],
            'значение не из JSON',
        ],
    ])('%s — проблема', (_name, value, message) => {
        const problems = problemsOf(parseArticleBlocks('theory-v1', value));
        expect(problems.join('\n')).toContain(message);
    });

    it('проблемы собираются по всем блокам с номерами, но не больше 50', () => {
        const many = Array.from({ length: 80 }, () => ({ kind: 'lead' }));
        const result = parseArticleBlocks('theory-v1', many);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problems).toHaveLength(SITE_ARTICLE_LIMITS.problems);
        expect(result.problems[1]).toMatchObject({ block: 1, field: 'text' });
    });

    it('потолки: 400 блоков, строка 20 000 знаков, вложенность, 512 КБ', () => {
        const lead = { kind: 'lead', text: 'x' };
        expect(parseArticleBlocks('theory-v1', Array(400).fill(lead)).ok).toBe(
            true,
        );
        expect(
            problemsOf(
                parseArticleBlocks('theory-v1', Array(401).fill(lead)),
            )[0],
        ).toContain('больше 400');
        expect(
            problemsOf(
                parseArticleBlocks('theory-v1', [
                    { kind: 'lead', text: 'я'.repeat(20_001) },
                ]),
            )[0],
        ).toContain('длиннее 20000 знаков');
        let deep: unknown = 'x';
        for (let i = 0; i < 20; i += 1) deep = { deep };
        expect(
            problemsOf(
                parseArticleBlocks('theory-v1', [
                    { kind: 'lead', text: 'x', deep },
                ]),
            )[0],
        ).toContain('вложенность');
        const big = Array.from({ length: 40 }, () => ({
            kind: 'paragraph',
            text: 'я'.repeat(19_000),
        }));
        expect(problemsOf(parseArticleBlocks('theory-v1', big))[0]).toContain(
            'больше 512 КБ',
        );
    });

    it('блоки из базы читаются по форме, без перепроверки видов', () => {
        expect(
            readStoredBlocks([{ kind: 'old-kind', text: 'x' }, 'мусор', null]),
        ).toEqual([{ kind: 'old-kind', text: 'x' }]);
        expect(readStoredBlocks({ kind: 'lead' })).toEqual([]);
    });
});
