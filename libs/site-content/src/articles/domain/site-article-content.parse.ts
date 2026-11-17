import {
    SITE_ARTICLE_LIMITS,
    SITE_ARTICLE_SLOT_MAX_LENGTH,
    SITE_ARTICLE_SLOT_PATTERN,
    type SiteArticleContentFormat,
} from './site-article.const';
import {
    SITE_ARTICLE_FORMAT_SPECS,
    type SiteArticleFieldRule,
    type SiteArticleFormatSpec,
} from './site-article-content.formats';
import {
    findJsonProblem,
    isPlainObject,
    jsonBytes,
    type SiteArticleJson,
    type SiteArticleJsonObject,
} from './site-article-json';

/** Блок статьи: объект JSON с видом в поле kind (theory-v1) или type (how-v1). */
export type SiteArticleBlock = SiteArticleJsonObject;

export interface SiteArticleContentProblem {
    /** Номер блока с 0; null — проблема всего списка. */
    block: number | null;
    field: string | null;
    message: string;
}

export type SiteArticleBlocksResult =
    | { ok: true; blocks: SiteArticleBlock[] }
    | { ok: false; problems: SiteArticleContentProblem[] };

const JSON_LIMITS = {
    maxString: SITE_ARTICLE_LIMITS.string,
    maxDepth: SITE_ARTICLE_LIMITS.depth,
} as const;

const fail = (
    ...problems: SiteArticleContentProblem[]
): SiteArticleBlocksResult => ({
    ok: false,
    problems: problems.slice(0, SITE_ARTICLE_LIMITS.problems),
});

const listProblem = (message: string): SiteArticleContentProblem => ({
    block: null,
    field: null,
    message,
});

const isAbsent = (value: SiteArticleJson | undefined): boolean =>
    value === undefined || value === null;

const isKey = (value: SiteArticleJson | undefined): boolean =>
    typeof value === 'string' &&
    value.length <= SITE_ARTICLE_SLOT_MAX_LENGTH &&
    SITE_ARTICLE_SLOT_PATTERN.test(value);

/** Путь на сайте: «/…», без «//» (чужой домен) и без пробелов. */
const isSitePath = (value: SiteArticleJson | undefined): boolean =>
    typeof value === 'string' &&
    /^\/(?!\/)\S*$/.test(value) &&
    !value.includes('\\');

const isStrings = (value: SiteArticleJson | undefined): value is string[] =>
    Array.isArray(value) && value.every(item => typeof item === 'string');

function fitsRule(
    value: SiteArticleJson | undefined,
    rule: SiteArticleFieldRule,
): boolean {
    if (typeof rule === 'object') {
        return (
            (rule.optional === true && isAbsent(value)) ||
            ((typeof value === 'string' || typeof value === 'number') &&
                rule.oneOf.includes(value))
        );
    }
    switch (rule) {
        case 'text':
            return typeof value === 'string' && value.trim().length > 0;
        case 'text?':
            return isAbsent(value) || typeof value === 'string';
        case 'texts':
            return isStrings(value) && value.length > 0;
        case 'list':
            return (
                Array.isArray(value) &&
                value.length > 0 &&
                value.every(isPlainObject)
            );
        case 'rows':
            return Array.isArray(value) && value.every(isStrings);
        case 'bool?':
            return isAbsent(value) || typeof value === 'boolean';
        case 'object?':
            return isAbsent(value) || isPlainObject(value);
        case 'slot':
            return isKey(value);
        case 'anchor?':
            return isAbsent(value) || isKey(value);
        case 'path?':
            return isAbsent(value) || isSitePath(value);
    }
}

const RULE_TEXT: Record<Exclude<SiteArticleFieldRule, object>, string> = {
    text: 'обязательный непустой текст',
    'text?': 'текст',
    texts: 'непустой список строк',
    list: 'непустой список объектов',
    rows: 'список строк таблицы, каждая — список текстов',
    'bool?': 'да или нет (true / false)',
    'object?': 'объект',
    slot: 'место медиа: латиница в нижнем регистре, цифры и дефисы, до 64 знаков',
    'anchor?':
        'якорь: латиница в нижнем регистре, цифры и дефисы, до 64 знаков',
    'path?': 'путь на сайте, начинается с «/»',
};

const describeRule = (rule: SiteArticleFieldRule): string =>
    typeof rule === 'object'
        ? `одно из: ${rule.oneOf.join(', ')}`
        : RULE_TEXT[rule];

type BlockCheck =
    | { block: SiteArticleBlock }
    | { problems: SiteArticleContentProblem[] };

function checkBlock(
    spec: SiteArticleFormatSpec,
    raw: unknown,
    index: number,
): BlockCheck {
    const n = index + 1;
    const problem = (field: string | null, message: string): BlockCheck => ({
        problems: [{ block: index, field, message }],
    });
    if (!isPlainObject(raw))
        return problem(null, `Блок ${n}: ожидается объект`);
    const jsonProblem = findJsonProblem(raw, JSON_LIMITS);
    if (jsonProblem) {
        return problem(
            jsonProblem.path,
            `Блок ${n}: поле «${jsonProblem.path}» — ${jsonProblem.message}`,
        );
    }
    const block = raw as SiteArticleBlock;
    const kind = block[spec.discriminator];
    const fields = typeof kind === 'string' ? spec.blocks[kind] : undefined;
    if (typeof kind !== 'string' || !fields) {
        const allowed = Object.keys(spec.blocks).join(', ');
        return problem(
            spec.discriminator,
            typeof kind === 'string' && kind
                ? `Блок ${n}: неизвестный вид «${kind}». Допустимы: ${allowed}`
                : `Блок ${n}: не указан вид блока (поле «${spec.discriminator}»)`,
        );
    }
    const problems = Object.entries(fields)
        .filter(([field, rule]) => !fitsRule(block[field], rule))
        .map(([field, rule]) => ({
            block: index,
            field,
            message: `Блок ${n} (${kind}): поле «${field}» — ${describeRule(rule)}`,
        }));
    return problems.length > 0 ? { problems } : { block };
}

/**
 * Блоки версии из базы: при сохранении они уже проверены, поэтому здесь —
 * только форма (список объектов JSON). Вид блоков не перепроверяется: иначе
 * ужесточение правил задним числом стёрло бы опубликованный текст.
 */
export function readStoredBlocks(value: unknown): SiteArticleBlock[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (item: unknown): item is SiteArticleBlock =>
            isPlainObject(item) && findJsonProblem(item, JSON_LIMITS) === null,
    );
}

/**
 * Блоки статьи из запроса или базы → проверенный список либо проблемы
 * по-русски (не больше 50). Проверки: список, не больше 400 блоков, вид из
 * формата, обязательные поля основных видов, только JSON, строка до
 * 20 000 знаков, весь текст до 512 КБ.
 */
export function parseArticleBlocks(
    format: SiteArticleContentFormat,
    value: unknown,
): SiteArticleBlocksResult {
    if (!Array.isArray(value)) {
        return fail(listProblem('Блоки статьи — это список'));
    }
    if (value.length > SITE_ARTICLE_LIMITS.blocks) {
        return fail(
            listProblem(
                `Блоков ${value.length} — больше ${SITE_ARTICLE_LIMITS.blocks}. Разделите статью на несколько`,
            ),
        );
    }
    const spec = SITE_ARTICLE_FORMAT_SPECS[format];
    const blocks: SiteArticleBlock[] = [];
    const problems: SiteArticleContentProblem[] = [];
    value.forEach((raw: unknown, index) => {
        const checked = checkBlock(spec, raw, index);
        if ('block' in checked) blocks.push(checked.block);
        else problems.push(...checked.problems);
    });
    if (problems.length > 0) return fail(...problems);
    const kb = Math.ceil(jsonBytes(blocks) / 1024);
    if (kb > SITE_ARTICLE_LIMITS.jsonBytes / 1024) {
        return fail(
            listProblem(
                `Текст статьи ${kb} КБ — больше ${SITE_ARTICLE_LIMITS.jsonBytes / 1024} КБ. Разделите статью на несколько`,
            ),
        );
    }
    return { ok: true, blocks };
}
