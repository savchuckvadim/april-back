import { EnumPortalAppCode } from '../portal-app-settings.schema';
import { APP_SETTING_GROUP_DOCS } from './app-setting-group-docs';

/**
 * Категории настроек для админки: у приложения сотня ключей, без групп
 * в них уже не найти нужное (запрос владельца 13.10.2026).
 *
 * Группа ключа считается ПРАВИЛОМ по коду (префикс или список кодов) —
 * одно место на весь реестр, а не поле в каждой из сотни записей. Новый
 * ключ с известным префиксом попадает в свою группу сам; с незнакомым —
 * в «Прочее», и тест реестра это поймает.
 *
 * Ссылки — разделы карточки портала в админке, с которыми группа связана
 * (поля, стадии, отделы). `{portalId}` подставляет фронт.
 */

export interface PortalAppSettingLink {
    title: string;
    /** Путь админки; `{portalId}` заменяется id портала. */
    href: string;
}

export interface PortalAppSettingGroup {
    title: string;
    description: string;
    links: readonly PortalAppSettingLink[];
    /**
     * Внутренняя документация категории для сотрудников April (markdown):
     * механизм, к чему приведёт включение, что подготовить, риски, где
     * смотреть результат. Не клиентская база знаний — подробнее и
     * технически. Тексты — в `app-setting-group-docs.ts`.
     */
    theory?: string;
}

const link = (title: string, path: string): PortalAppSettingLink => ({
    title,
    href: `/portal/{portalId}${path}`,
});

/** Глобальная страница админки (без портала). */
const globalLink = (title: string, href: string): PortalAppSettingLink => ({
    title,
    href,
});

/** Путеводитель по AI-аналитике: якорь — код раздела. */
const AI_GUIDE_PATH = '/ai-analytics/guide';
const guideLink = (title: string, section: string): PortalAppSettingLink =>
    globalLink(title, `${AI_GUIDE_PATH}#${section}`);

const LINK = {
    dealFields: link('Поля и стадии сделки', '/pbx/deal'),
    companyFields: link('Поля компании', '/pbx/company'),
    leadFields: link('Поля и стадии лида', '/pbx/lead'),
    departments: link('Отделы', '/pbx/departament'),
    callGroup: link('Группа звонков', '/pbx/group'),
    tasks: link('Задачи', '/pbx/task'),
    lists: link('Списки (KPI)', '/pbx/list'),
    questionnaires: link('Анкеты', '/questionnaires'),
    superUsers: link('Суперпользователи', '/vendor-super-users'),
    // --- AI-аналитика ОП ---
    aiSettings: link('Настройки AI портала (конвейер разбора)', '/ai-settings'),
    aiKnowledge: link('База знаний портала', '/ai-settings?tab=knowledge'),
    aiModel: globalLink(
        'AI-аналитика → Модель и обратная связь',
        '/ai-analytics/model',
    ),
    aiAudit: globalLink('AI-аналитика → Аудит данных', '/ai-analytics/audit'),
    aiGuideEnable: guideLink(
        'Путеводитель: включение и рассылки',
        'enable-and-push',
    ),
    aiGuidePeople: guideLink(
        'Путеводитель: сотрудники и цели',
        'people-and-targets',
    ),
    aiGuideModel: guideLink('Путеводитель: модель и данные', 'model-and-data'),
    aiGuideForecast: guideLink('Путеводитель: прогноз отдела', 'forecast'),
    aiGuideLaunch: guideLink(
        'Путеводитель: запуск после выкладки',
        'launch-after-release',
    ),
} as const;

/** Справочник групп. Порядок ключей = порядок секций в админке. */
export const PORTAL_APP_SETTING_GROUPS = {
    // --- portal ---
    portal_product: {
        title: 'Продукт',
        description: 'Версия продукта на портале.',
        links: [],
    },
    portal_bitrix_limits: {
        title: 'Лимиты запросов к Битрикс24',
        description:
            'Очередь запросов к порталу: тариф, доля для фоновых задач и ' +
            'сколько ждать. Защищает портал от перегрузки нашими запросами.',
        links: [],
    },
    // --- sales ---
    sales_visibility: {
        title: 'Видимость структуры',
        description:
            'Кому принудительно видна своя группа, свой отдел или вся структура.',
        links: [LINK.departments, LINK.superUsers],
    },
    // --- kpi-sales ---
    ai_analytics_main: {
        title: 'AI-аналитика: включение и рассылки',
        description:
            'Включение AI-аналитики, алерты, утренние разборы, витрины и кому ' +
            'приходят сводки.',
        links: [
            LINK.aiGuideEnable,
            LINK.aiGuideLaunch,
            LINK.aiSettings,
            LINK.aiModel,
            LINK.aiAudit,
        ],
    },
    ai_analytics_people: {
        title: 'AI-аналитика: сотрудники и цели',
        description:
            'Уровни менеджеров, цели, отсутствия, согласия и параметры по ' +
            'сотрудникам.',
        links: [
            LINK.aiGuidePeople,
            LINK.departments,
            LINK.aiSettings,
            LINK.aiAudit,
        ],
    },
    ai_analytics_model: {
        title: 'AI-аналитика: модель и данные',
        description:
            'Параметры модели, определения и журнал событий, оценивание, ' +
            'календарь и гипотезы.',
        links: [
            LINK.aiGuideModel,
            LINK.aiGuideForecast,
            LINK.aiKnowledge,
            LINK.aiModel,
            LINK.aiAudit,
        ],
    },
    // --- event-sales ---
    lead_sla: {
        title: 'Заявки: SLA принятия',
        description:
            'Сколько минут у сотрудника на принятие заявки и как часто её ' +
            'передавать дальше.',
        links: [LINK.leadFields],
    },
    lead_distribution: {
        title: 'Заявки: распределение по сотрудникам',
        description:
            'Кому достаются заявки: соответствие отделов, неработающие ' +
            'сотрудники, исключения из круга, отделы, где заявка становится ' +
            'компанией.',
        links: [LINK.departments],
    },
    lead_repeat: {
        title: 'Заявки: повторная заявка',
        description:
            'Присоединять повторную заявку к открытой работе клиента и какие ' +
            'почтовые домены не означают одного клиента.',
        links: [],
    },
    lead_duplicates: {
        title: 'Заявки: проверка дублей',
        description: 'Проверка дублей при назначении заявки.',
        links: [LINK.leadFields],
    },
    lead_rescue: {
        title: 'Заявки: страховка входа',
        description:
            'Крон, который разбирает заявки, застрявшие в «Очереди в ХО».',
        links: [LINK.leadFields],
    },
    lead_to_deal: {
        title: 'Заявка → сделка: что переносить',
        description:
            'Что переносится из заявки в сделку: дела, комментарий, клиент.',
        links: [LINK.dealFields, LINK.leadFields],
    },
    calls_features: {
        title: 'Экран «Звонки»: возможности',
        description:
            'Что включено в приложении «Звонки»: недозвон, ТМЦ, записи, ' +
            'транскрибация, AI, анкеты, подсказки, кнопки.',
        links: [LINK.questionnaires],
    },
    calls_checklists: {
        title: 'Чек-листы и вопросы',
        description:
            'Чек-листы стадий и вопросы при отчёте, чек-лист в задаче обзвона.',
        links: [LINK.questionnaires, LINK.dealFields],
    },
    calls_tasks: {
        title: 'Задачи обзвона и даты событий',
        description:
            'Группа задач обзвона, постановщик и как считаются даты ' +
            'следующего события.',
        links: [LINK.callGroup, LINK.tasks],
    },
    reject_revive: {
        title: 'Реанимация отказников',
        description:
            'Через сколько дней и кому снова ставить холодный обзвон по ' +
            'отказникам.',
        links: [LINK.dealFields],
    },
    xo_rescue: {
        title: 'Подстраховка ХО',
        description:
            'Досылка холодных обзвонов, которые не дошли. Работает по полям-' +
            'меткам «взято в очередь» и «хук отправлен» на компании и сделке: ' +
            'БП ставит первую ({=System:Now}) перед вебхуком. Без полей и ' +
            'метки подстраховке не по чему досылать.',
        links: [LINK.companyFields, LINK.dealFields],
    },
    deal_audit: {
        title: 'Аудит сделок',
        description:
            'Ночной разбор открытых сделок ОП: признаки «забыта», ' +
            '«застряла», «забыли закрыть» и сводки сотрудникам и РОПам.',
        links: [LINK.dealFields, LINK.departments],
    },
    duplicate_report: {
        title: 'Отчёт по дублям сделок',
        description:
            'Еженедельная задача руководителю с таблицей дублей: когда и кому.',
        links: [LINK.departments, LINK.dealFields],
    },
    // --- skap ---
    skap_import: {
        title: 'Импорт СКАП',
        description:
            'Импорт статистики СКАП с Диска: расписание, лимиты, кому писать.',
        links: [LINK.lists],
    },
    // --- общее ---
    other: {
        title: 'Прочее',
        description: 'Настройки без категории.',
        links: [],
    },
} as const satisfies Record<string, PortalAppSettingGroup>;

export type PortalAppSettingGroupCode = keyof typeof PORTAL_APP_SETTING_GROUPS;

/** Правило: группа по списку кодов и/или префиксам. Первое совпавшее решает. */
interface GroupRule {
    group: PortalAppSettingGroupCode;
    codes?: readonly string[];
    prefixes?: readonly string[];
}

const AI_PEOPLE_CODES = [
    'ai_analytics_style_opt_out',
    'ai_analytics_pool_opt_in',
    'ai_analytics_pool_consent_at',
    'ai_analytics_levels',
    'ai_analytics_targets',
    'ai_analytics_absences',
    'ai_analytics_manager_params',
    'ai_analytics_roster_confirmed_at',
] as const;
const AI_MODEL_CODES = [
    'ai_analytics_model_params',
    'ai_analytics_definitions',
    'ai_analytics_events',
    'ai_analytics_scoring',
    'ai_analytics_hypothesis',
    'ai_analytics_calendar',
] as const;

const GROUP_RULES: Record<EnumPortalAppCode, readonly GroupRule[]> = {
    [EnumPortalAppCode.portal]: [
        { group: 'portal_product', codes: ['product_version'] },
        { group: 'portal_bitrix_limits', prefixes: ['bitrix_'] },
    ],
    [EnumPortalAppCode.sales]: [
        { group: 'sales_visibility', prefixes: ['visibility_'] },
    ],
    [EnumPortalAppCode.kpiSales]: [
        { group: 'ai_analytics_people', codes: AI_PEOPLE_CODES },
        { group: 'ai_analytics_model', codes: AI_MODEL_CODES },
        { group: 'ai_analytics_main', prefixes: ['ai_analytics_'] },
    ],
    [EnumPortalAppCode.eventSales]: [
        // Подстраховка ХО: порог досылки исторически назван reject_revive_*.
        {
            group: 'xo_rescue',
            codes: ['reject_revive_resend_after_minutes'],
            prefixes: ['xo_rescue_'],
        },
        { group: 'lead_sla', prefixes: ['lead_intake_sla_'] },
        { group: 'lead_rescue', prefixes: ['lead_intake_rescue_'] },
        { group: 'lead_repeat', prefixes: ['lead_intake_repeat_'] },
        {
            group: 'lead_duplicates',
            prefixes: ['lead_intake_duplicate_check_'],
        },
        {
            group: 'lead_distribution',
            codes: [
                'lead_intake_department_aliases',
                'lead_intake_inactive_department_ids',
                'lead_intake_round_robin_excluded_user_ids',
                'lead_client_company_department_ids',
            ],
        },
        { group: 'lead_to_deal', prefixes: ['lead_work_'] },
        {
            group: 'calls_checklists',
            codes: ['task_checklist_enabled', 'refine_stage_on_plan_enabled'],
            prefixes: ['checklist_'],
        },
        {
            group: 'calls_tasks',
            codes: [
                'task_group_id',
                'boss_id',
                'calculated_next_event_enabled',
                'final_fields_reset_enabled',
            ],
        },
        {
            group: 'calls_features',
            codes: [
                'questionnaires_disabled_event_types',
                'konstructor_slider_enabled',
                'action_prompts_enabled',
                'relation_strips_enabled',
            ],
            prefixes: ['with_'],
        },
        { group: 'reject_revive', prefixes: ['reject_revive_'] },
        { group: 'deal_audit', prefixes: ['deal_audit_'] },
        { group: 'duplicate_report', prefixes: ['duplicate_report_'] },
    ],
    [EnumPortalAppCode.konstructor]: [],
    [EnumPortalAppCode.skap]: [{ group: 'skap_import', prefixes: [''] }],
};

/** Группа ключа: первое совпавшее правило приложения, иначе «Прочее». */
export function resolveAppSettingGroup(
    appCode: EnumPortalAppCode,
    settingCode: string,
): PortalAppSettingGroupCode {
    const rule = GROUP_RULES[appCode].find(
        item =>
            item.codes?.includes(settingCode) ||
            item.prefixes?.some(prefix => settingCode.startsWith(prefix)),
    );
    return rule ? rule.group : 'other';
}

/**
 * Группы, в которые реально попали ключи приложения, — в порядке
 * справочника (так их и рисует админка), с внутренней документацией.
 */
export function listAppSettingGroups(
    used: ReadonlySet<PortalAppSettingGroupCode>,
): Array<{ code: PortalAppSettingGroupCode } & PortalAppSettingGroup> {
    return (
        Object.keys(PORTAL_APP_SETTING_GROUPS) as PortalAppSettingGroupCode[]
    )
        .filter(code => used.has(code))
        .map(code => {
            const theory = APP_SETTING_GROUP_DOCS[code];
            return {
                code,
                ...PORTAL_APP_SETTING_GROUPS[code],
                ...(theory ? { theory } : {}),
            };
        });
}
