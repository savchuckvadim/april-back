import type { SiteArticleContentFormat } from './site-article.const';

/**
 * Обязательные поля основных видов блоков по формату. Проверяется форма,
 * которую понимает движок сайта; глубокие договорённости (якоря для
 * «Отчёта», id мест скринов, плашка готовности, анкеты брифов) проверяет
 * фронт: админка — перед публикацией, сайт — при отрисовке. Лишние поля
 * блока не мешают: сайт берёт известные.
 *
 * Правила поля:
 * - text / text? — непустая строка / строка, если есть;
 * - texts — непустой список строк;
 * - list — непустой список объектов (поля элементов проверяет фронт);
 * - rows — список строк таблицы, каждая — список строк;
 * - bool? / object? — да-нет / объект, если есть;
 * - slot — место медиа: как id места кадра (латиница, цифры, дефисы);
 * - anchor? — якорь заголовка, если есть: тот же шаблон;
 * - path? — путь к файлу на сайте, если есть: только «/…», не чужой адрес;
 * - oneOf — одно из значений (optional — если есть).
 */
export type SiteArticleFieldRule =
    | 'text'
    | 'text?'
    | 'texts'
    | 'list'
    | 'rows'
    | 'bool?'
    | 'object?'
    | 'slot'
    | 'anchor?'
    | 'path?'
    | { oneOf: readonly (string | number)[]; optional?: true };

export interface SiteArticleFormatSpec {
    /** Поле, в котором блок хранит свой вид. */
    discriminator: 'kind' | 'type';
    blocks: Readonly<
        Record<string, Readonly<Record<string, SiteArticleFieldRule>>>
    >;
}

const READINESS = ['live', 'wip', 'open'] as const;
const SCREEN_ASPECTS = ['16:9', '4:3', 'phone'] as const;

/** theory-v1 — блоки движка process/_core (TheoryBlock сайта) и новый блок media. */
const THEORY_V1: SiteArticleFormatSpec = {
    discriminator: 'kind',
    blocks: {
        benefit: { feature: 'text', meaning: 'text', gain: 'text' },
        entities: { title: 'text', intro: 'text', columns: 'list' },
        checklist: { title: 'text', intro: 'text', items: 'list' },
        lead: { text: 'text' },
        heading: { text: 'text', id: 'anchor?' },
        paragraph: { text: 'text' },
        obvious: { intuition: 'text', reality: 'text', consequence: 'text' },
        discourse: {
            question: 'text',
            positions: 'list',
            price: 'text',
            recommendation: 'text?',
            preview: 'object?',
        },
        practice: { text: 'text' },
        danger: { text: 'text' },
        scenario: { title: 'text', options: 'list' },
        screen: {
            label: 'text',
            aspect: { oneOf: SCREEN_ASPECTS, optional: true },
            src: 'path?',
        },
        table: { head: 'texts', rows: 'rows', caption: 'text?' },
        steps: { items: 'list' },
        list: { items: 'texts', ordered: 'bool?' },
        note: {
            tone: { oneOf: ['good', 'warn', 'bad', 'neutral'] },
            text: 'text',
        },
        diagram: { chart: 'text', caption: 'text?' },
        code: { lang: 'text', code: 'text', caption: 'text?' },
        glossary: { items: 'list' },
        links: { items: 'list' },
        questionnaire: { questionnaireId: 'text' },
        readiness: { state: { oneOf: READINESS }, text: 'text' },
        media: {
            slot: 'slot',
            aspect: { oneOf: SCREEN_ASPECTS, optional: true },
        },
    },
};

/** how-v1 — блоки «Как мы работаем» (HowContentBlock сайта): вид в поле type. */
const HOW_V1: SiteArticleFormatSpec = {
    discriminator: 'type',
    blocks: {
        lead: { text: 'text' },
        heading: { text: 'text' },
        paragraph: { text: 'text' },
        cards: { items: 'list', columns: { oneOf: [2, 3], optional: true } },
        steps: { items: 'list' },
        list: { items: 'texts' },
        table: { head: 'texts', rows: 'rows', caption: 'text?' },
        note: {
            tone: { oneOf: ['info', 'good', 'warn', 'bad'] },
            text: 'text',
        },
        story: { tag: 'text', text: 'text' },
        diagram: { chart: 'text', caption: 'text?' },
        screen: { label: 'text' },
        questionnaire: { questionnaireId: 'text' },
        media: { slot: 'slot' },
    },
};

export const SITE_ARTICLE_FORMAT_SPECS = {
    'theory-v1': THEORY_V1,
    'how-v1': HOW_V1,
} as const satisfies Record<SiteArticleContentFormat, SiteArticleFormatSpec>;
