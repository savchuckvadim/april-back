/**
 * Адреса страниц админки, на которые ссылается путеводитель. Одно место:
 * сменится маршрут фронта — правится здесь, а не в семи разделах.
 * `{portalId}` подставляет фронт (`resolveSettingsLink`); пути без
 * плейсхолдера — глобальные страницы админки.
 */
import type { AiGuideAdminPage } from './ai-guide.types';

export const AI_GUIDE_PATH = '/ai-analytics/guide' as const;

/** Якорь настройки в карточке портала: `#setting-<snake_case код>`. */
export const settingAnchor = (code: string): string => `setting-${code}`;
/** Якорь категории настроек: `#group-<код категории>`. */
export const groupAnchor = (group: string): string => `group-${group}`;

const PORTAL = '/portal/{portalId}' as const;

export const AI_GUIDE_HREF = {
    guide: AI_GUIDE_PATH,
    guideSection: (code: string): string => `${AI_GUIDE_PATH}#${code}`,
    model: '/ai-analytics/model',
    audit: '/ai-analytics/audit',
    statisticsAi: '/statistics/ai',
    portalStatisticsAi: `${PORTAL}/statistics/ai`,
    portalAppSettings: `${PORTAL}/app-settings`,
    portalAppSettingsGroup: (group: string): string =>
        `${PORTAL}/app-settings#${groupAnchor(group)}`,
    portalAppSetting: (code: string): string =>
        `${PORTAL}/app-settings#${settingAnchor(code)}`,
    portalAiSettings: `${PORTAL}/ai-settings`,
    portalKnowledge: `${PORTAL}/ai-settings?tab=knowledge`,
    portalKnowledgeKind: (kind: string): string =>
        `${PORTAL}/ai-settings?tab=knowledge&kind=${kind}`,
    portalSmarts: `${PORTAL}/pbx/smart`,
    portalDepartments: `${PORTAL}/pbx/departament`,
} as const;

/** Готовые страницы для разделов (переиспользуются несколькими разделами). */
export const AI_GUIDE_PAGE = {
    settingsMain: {
        title: 'Настройки kpiSales: включение и рассылки',
        href: AI_GUIDE_HREF.portalAppSettingsGroup('ai_analytics_main'),
        note: 'Ключи ai_analytics_* категории «включение и рассылки» карточки портала.',
    },
    settingsPeople: {
        title: 'Настройки kpiSales: сотрудники и цели',
        href: AI_GUIDE_HREF.portalAppSettingsGroup('ai_analytics_people'),
        note: 'Уровни, цели, отсутствия, параметры по сотрудникам, согласия.',
    },
    settingsModel: {
        title: 'Настройки kpiSales: модель и данные',
        href: AI_GUIDE_HREF.portalAppSettingsGroup('ai_analytics_model'),
        note: 'JSON переопределений реестра, определений, оценивания, календаря и событий.',
    },
    aiSettings: {
        title: 'Настройки AI портала (конвейер разбора звонков)',
        href: AI_GUIDE_HREF.portalAiSettings,
        note: 'Включение конвейера, пилот allowedUserIds, порог длительности, модели, строгость презентации, свои названия.',
    },
    knowledge: {
        title: 'База знаний портала',
        href: AI_GUIDE_HREF.portalKnowledge,
        note: 'Документы по kind: инструкции разбора по типам, классификатор, скрипт, регламент, факты о продукте.',
    },
    launchPanel: {
        title: 'Карточка портала → Настройки AI: «Запуск AI после выкладки»',
        href: AI_GUIDE_HREF.portalAiSettings,
        note: 'Большие кнопки по шагам: смарт, кэш, история, прогноз, переразбор — с подтверждением, состоянием и подсказкой «что дальше».',
    },
    smarts: {
        title: 'Смарт-процессы портала (установка «AI-анализ звонков»)',
        href: AI_GUIDE_HREF.portalSmarts,
        note: 'Кнопка установки смарта из карточки портала; повторный запуск доливает значения перечислений.',
    },
    model: {
        title: 'AI-аналитика → Модель и обратная связь',
        href: AI_GUIDE_HREF.model,
        note: 'Снапшоты Фазы 4 (прогноз, пул, связь качества, эффект советов) и сводка обратной связи по порталу.',
    },
    audit: {
        title: 'AI-аналитика → Аудит данных',
        href: AI_GUIDE_HREF.audit,
        note: 'Аудит данных по живой БД, проба истории стадий, надёжность оценщика (test-retest).',
    },
    statisticsAi: {
        title: 'Статистика → AI (разборы звонков)',
        href: AI_GUIDE_HREF.statisticsAi,
        note: 'Список разборов всех порталов: что именно модель написала по звонку.',
    },
    portalStatisticsAi: {
        title: 'Карточка портала → Статистика → AI',
        href: AI_GUIDE_HREF.portalStatisticsAi,
        note: 'Разборы звонков одного портала.',
    },
    departments: {
        title: 'Отделы портала',
        href: AI_GUIDE_HREF.portalDepartments,
        note: 'Состав отдела продаж: кто попадает в периметр разбора при salesOnly и в структуру витрины.',
    },
} as const satisfies Record<string, AiGuideAdminPage>;
