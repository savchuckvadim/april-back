/**
 * Путеводитель по AI-аналитике ОП для админки — ЕДИНСТВЕННЫЙ источник
 * правды «что с чем связано»: разделы с теорией (markdown), ключи
 * настроек kpiSales, поля настроек конвейера портала, коды реестра
 * параметров, kind'ы базы знаний, ручки и страницы админки.
 *
 * Правило: каталог хранит только КОДЫ и заметки «как связано». Названия,
 * описания, типы, дефолты и диапазоны берутся при отдаче из реестров
 * (`PORTAL_APP_SETTINGS_SCHEMA`, `AI_ANALYTICS_PARAMS`,
 * `KNOWN_KNOWLEDGE_KINDS`) — выдуманный код ловит спека каталога.
 * Образец — каталог хуков `@lib/portal-lib/hooks/catalog`.
 */
import type { PortalAiSettingsRecord } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.types';

/** Поле настроек конвейера портала (`portal_ai_settings`), кроме служебного. */
export type AiGuidePortalAiSettingField = Exclude<
    keyof PortalAiSettingsRecord,
    'lastScanAt'
>;

/** Ключ (camelCase) схемы настроек приложения kpiSales. */
export interface AiGuideSettingRef {
    key: string;
    /** Как раздел использует настройку: к чему приведёт значение. */
    note: string;
}

export interface AiGuidePortalAiSettingRef {
    field: AiGuidePortalAiSettingField;
    note: string;
}

/** Код реестра параметров `AI_ANALYTICS_PARAMS`. */
export interface AiGuideParamRef {
    code: string;
    /** Заметка раздела; без неё показывается описание реестра. */
    note?: string;
}

/** Kind базы знаний из `KNOWN_KNOWLEDGE_KINDS`. */
export interface AiGuideKnowledgeKindRef {
    kind: string;
    note?: string;
}

/** Приложение, в котором живёт ручка (у каждого свой Swagger). */
export type AiGuideEndpointApp = 'admin' | 'kpi-report-sales' | 'event-sales';

export type AiGuideEndpointMethod = 'GET' | 'POST';

/**
 * Код действия для формы «Запуск» в админке. Ручки admin фронт зовёт
 * сгенерированным клиентом; ручки kpi-report-sales и event-sales из
 * админки недоступны — фронт показывает Swagger и готовое тело.
 */
export type AiGuideActionCode =
    | 'backfill'
    | 'recompute'
    | 'etl-status'
    | 'forecast-backtest'
    | 'stage-history-probe'
    | 'reanalyze'
    | 'reanalyze-status'
    | 'cost'
    | 'feedback'
    | 'golden-set'
    | 'golden-set-run'
    | 'retention'
    | 'cache-reset'
    | 'install-smart'
    | 'push';

export interface AiGuideEndpoint {
    app: AiGuideEndpointApp;
    method: AiGuideEndpointMethod;
    /** Путь без префикса `/api`, например `admin/ai-analytics/backfill`. */
    path: string;
    action?: AiGuideActionCode;
    /** Пример тела (JSON одной строкой); `{domain}` подставляет фронт. */
    body?: string;
    /** Пример query-строки, например `domain={domain}&months=6`. */
    query?: string;
    /** Когда звать. */
    when: string;
    /** Зачем: что произойдёт и что вернётся. */
    purpose: string;
}

export interface AiGuideAdminPage {
    title: string;
    /** Путь админки; `{portalId}` подставляет фронт (без него — глобальная страница). */
    href: string;
    note?: string;
}

/** Шаг чек-листа «Запуск после выкладки». */
export interface AiGuideLaunchStep {
    code: string;
    title: string;
    /** Что сделать и как проверить. Markdown. */
    markdown: string;
    /** Действие формы «Запуск» рядом с шагом. */
    action?: AiGuideActionCode;
}

/**
 * Обязательные подразделы теории (заголовки `##` в markdown): без любого
 * из них раздел неполный, спека каталога это ловит.
 */
export const AI_GUIDE_THEORY_HEADINGS = [
    'Что это',
    'Как работает',
    'Когда срабатывает',
    'Где смотреть результат',
    'Что подготовить',
    'Риски',
] as const;
export type AiGuideTheoryHeading = (typeof AI_GUIDE_THEORY_HEADINGS)[number];

export interface AiGuideSection {
    code: string;
    title: string;
    /** Одно-два предложения для оглавления. */
    summary: string;
    /** Теория с подразделами `AI_GUIDE_THEORY_HEADINGS`. Markdown. */
    theory: string;
    settings: readonly AiGuideSettingRef[];
    portalAiSettings: readonly AiGuidePortalAiSettingRef[];
    params: readonly AiGuideParamRef[];
    /**
     * Тематические группы реестра, которые раздел показывает целиком
     * (в дополнение к `params`). Коды — `AI_GUIDE_PARAM_GROUP_CODES`.
     */
    paramGroups?: readonly string[];
    knowledgeKinds: readonly AiGuideKnowledgeKindRef[];
    endpoints: readonly AiGuideEndpoint[];
    adminPages: readonly AiGuideAdminPage[];
    /** Коды связанных разделов путеводителя. */
    related: readonly string[];
    launch?: readonly AiGuideLaunchStep[];
}
