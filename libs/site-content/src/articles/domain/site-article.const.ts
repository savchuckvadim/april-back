/**
 * Статьи сайта (таблицы site_articles, site_article_revisions,
 * site_article_media — миграция online 2026_11_18_100100). Перечни здесь,
 * в базе они строки: раздел — это маршрут и движок отрисовки сайта, без
 * кода новый раздел всё равно не появится.
 */

/** Формат блоков: каким движком сайта их рисовать. */
export const SITE_ARTICLE_CONTENT_FORMATS = ['theory-v1', 'how-v1'] as const;
export type SiteArticleContentFormat =
    (typeof SITE_ARTICLE_CONTENT_FORMATS)[number];

export const SITE_ARTICLE_SECTIONS = [
    'ai',
    'process-sales',
    'articles',
    'how-we-work',
] as const;
export type SiteArticleSection = (typeof SITE_ARTICLE_SECTIONS)[number];

export interface SiteArticleSectionConfig {
    /** Название раздела для админки. */
    title: string;
    /** Где раздел живёт на сайте. */
    basePath: string;
    /**
     * Главы раздела лежат в коде сайта: строка в базе заводится кнопкой
     * «взять текст из кода» (ensure), без опубликованной версии сайт
     * показывает код.
     */
    codeChapters: boolean;
    /** Открытый список: статьи создаются в админке, без кода. */
    openList: boolean;
    /** Формат блоков раздела. */
    format: SiteArticleContentFormat;
}

/**
 * Разделы сайта. `how-we-work` зарезервирован: формат `how-v1` — следующий
 * шаг, таблицы его уже допускают.
 */
export const SITE_ARTICLE_SECTION_CONFIG = {
    ai: {
        title: 'AI для отдела продаж',
        basePath: '/ai',
        codeChapters: true,
        openList: false,
        format: 'theory-v1',
    },
    'process-sales': {
        title: 'Процесс продаж',
        basePath: '/process/sales',
        codeChapters: true,
        openList: false,
        format: 'theory-v1',
    },
    articles: {
        title: 'Статьи',
        basePath: '/articles',
        codeChapters: false,
        openList: true,
        format: 'theory-v1',
    },
    'how-we-work': {
        title: 'Как мы работаем',
        basePath: '/how-we-work',
        codeChapters: true,
        openList: false,
        format: 'how-v1',
    },
} as const satisfies Record<SiteArticleSection, SiteArticleSectionConfig>;

/**
 * Тип статьи: `chapter` — глава с текстом по умолчанию в коде сайта;
 * остальные — статьи без кода.
 */
export const SITE_ARTICLE_TYPES = [
    'chapter',
    'article',
    'guide',
    'news',
    'case',
] as const;
export type SiteArticleType = (typeof SITE_ARTICLE_TYPES)[number];

/**
 * - draft — ни разу не публиковалась;
 * - published — на сайте опубликованная версия;
 * - unpublished — снята: у главы сайт показывает код, у статьи — 404;
 * - archived — в архиве, адрес остаётся занятым.
 */
export const SITE_ARTICLE_STATUSES = [
    'draft',
    'published',
    'unpublished',
    'archived',
] as const;
export type SiteArticleStatus = (typeof SITE_ARTICLE_STATUSES)[number];

/** Откуда версия: правка в админке, текст из кода сайта, копия прежней версии. */
export const SITE_ARTICLE_REVISION_SOURCES = [
    'admin',
    'code',
    'restore',
] as const;
export type SiteArticleRevisionSource =
    (typeof SITE_ARTICLE_REVISION_SOURCES)[number];

/** Источник версии, который может прислать админка; restore — только кнопкой «вернуть». */
export const SITE_ARTICLE_DRAFT_SOURCES = [
    'admin',
    'code',
] as const satisfies readonly SiteArticleRevisionSource[];
export type SiteArticleDraftSource =
    (typeof SITE_ARTICLE_DRAFT_SOURCES)[number];

/** Роль медиа в статье: обложка, место в тексте (id блока), галерея. */
export const SITE_ARTICLE_MEDIA_ROLES = ['cover', 'inline', 'gallery'] as const;
export type SiteArticleMediaRole = (typeof SITE_ARTICLE_MEDIA_ROLES)[number];

/** Место обложки — постоянное. */
export const SITE_ARTICLE_COVER_SLOT = 'cover';

/** Адрес внутри раздела: латиница, цифры, дефисы, «/» между частями. */
export const SITE_ARTICLE_SLUG_PATTERN = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/;
export const SITE_ARTICLE_SLUG_MAX_LENGTH = 191;
/** Обзорная глава раздела (в коде сайта slug ''). */
export const SITE_ARTICLE_INDEX_SLUG = 'index';

/** Место в тексте (id блока-скрина): как места кадров хранилища картинок. */
export const SITE_ARTICLE_SLOT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SITE_ARTICLE_SLOT_MAX_LENGTH = 64;

/** Потолки содержимого — защита базы и админки от случайного мусора. */
export const SITE_ARTICLE_LIMITS = {
    blocks: 400,
    string: 20_000,
    jsonBytes: 512 * 1024,
    depth: 16,
    metaBytes: 16 * 1024,
    problems: 50,
    title: 255,
    eyebrow: 255,
    description: 20_000,
    seoTitle: 255,
    seoDescription: 500,
    baseCodeHash: 16,
    comment: 255,
    caption: 500,
} as const;

/** Порядок в перечне раздела по умолчанию (колонка sort). */
export const SITE_ARTICLE_DEFAULT_SORT = 500;
