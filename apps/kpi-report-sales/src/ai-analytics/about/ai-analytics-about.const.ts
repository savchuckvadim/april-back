import type {
    AiAnalyticsParamCode,
    ParamResolveReason,
    ParamResolveSource,
    ParamSource,
} from '@lib/sales-ai-analytics';

/**
 * Блок «Как считаем» (план Фазы 2 §6, долг 26 волны C): статические
 * тексты по ручкам витрины и перечень кодов параметров, которые ручка
 * использует. Числа в блоке НЕ пишутся руками — их подставляет билдер из
 * реестра и снапшота модели портала; здесь только слова и коды.
 *
 * Перечень кодов закреплён `__tests__/about.spec.ts`: спека транзитивно
 * сканирует исходники ручки и требует, чтобы каждый найденный код был в
 * её списке. Новый код в коде ручки → дописать сюда, иначе спека красная.
 */
export const AI_ABOUT_ROUTE = 'about' as const;

/** Сегмент `requestKey` конверта: `…:{domain}:about:{endpoint}`. */
export const AI_ABOUT_KEY_SECTION = 'about' as const;

/** Ручки витрины, у которых есть блок «Как считаем». */
export const AI_ABOUT_ENDPOINTS = [
    'overview',
    'plan/daily',
    'brief',
    'manager/style',
] as const;
export type AiAboutEndpoint = (typeof AI_ABOUT_ENDPOINTS)[number];

/** Класс параметра реестра: оценка из данных, решение человека, гибрид. */
export const AI_ABOUT_PARAM_CLASSES = [
    'estimated',
    'configured',
    'hybrid',
] as const satisfies readonly ParamSource[];

/** Слой, давший значение параметра при разрешении. */
export const AI_ABOUT_PARAM_LAYERS = [
    'default',
    'portal',
    'tenure',
    'manager',
    'hybrid',
] as const satisfies readonly ParamResolveSource[];

/** Почему значение слоя не применено и взят дефолт реестра. */
export const AI_ABOUT_RESOLVE_REASONS = [
    'out-of-range',
    'type-mismatch',
    'invalid-value',
    'unknown-code',
] as const satisfies readonly ParamResolveReason[];

/** Оценки модели портала в блоке: код реестра, символ и подпись. */
export const AI_ABOUT_ESTIMATES = {
    kappa: {
        code: 'kappa_edge_late',
        symbol: 'κ',
        title: 'Сила усадки менеджера к норме',
    },
    phi: {
        code: 'overdispersion_default',
        symbol: 'φ',
        title: 'Сверхдисперсия темпов активностей',
    },
    lambda: {
        code: 'forget_lambda',
        symbol: 'λ',
        title: 'Забывание прошлых месяцев',
    },
} as const satisfies Readonly<
    Record<
        string,
        { code: AiAnalyticsParamCode; symbol: string; title: string }
    >
>;

/** Почему в блоке нет модели портала — честная деградация (§5.4). */
export const AI_ABOUT_MODEL_REASONS = {
    missing:
        'Модель портала ещё не рассчитана: месячный шаг ночного конвейера не ' +
        'отработал. Параметры показаны по реестру и настройкам портала, ' +
        'режим готовности без модели — не выше descriptive.',
    unavailable:
        'Хранилище снапшотов не ответило: модель портала прочитать не ' +
        'удалось. Параметры показаны по реестру и настройкам портала.',
} as const;

export interface AiAboutEndpointText {
    readonly endpoint: AiAboutEndpoint;
    readonly title: string;
    readonly purpose: string;
    /** Откуда берутся данные. */
    readonly sources: readonly string[];
    /** Как читать результат. */
    readonly howToRead: readonly string[];
    /** Чего ручка не делает (границы). */
    readonly notDoing: readonly string[];
    /** Коды реестра, которые ручка использует (проверяется спекой). */
    readonly params: readonly AiAnalyticsParamCode[];
}

/**
 * Коды, общие для всех ручек: порог разбора, пороги «мало данных» и
 * доверия (`AI_ANALYTICS_THRESHOLDS`), XmR, гейт совета, сцепка.
 */
const SHARED_PARAMS = [
    'min_duration_sec',
    'min_duration_sec_by_type',
    'n_min_none',
    'n_min_ok_score',
    'n_min_ok_rate',
    'n_min_rating',
    'trend_window_calls',
    'xmr_sigma',
    'xmr_run_length',
    'z_compare',
    'evidence_gate_advice',
    'deal_chain_min_pct',
    'deal_chain_exit_pct',
    'pool_min_portals_beta',
] as const satisfies readonly AiAnalyticsParamCode[];

/** Коды норм и рычагов, общие для обзора и плана дня. */
const NORM_PARAMS = [
    'kappa_edge_early',
    'kappa_edge_late',
    'kappa_max',
    'kappa_activity_days',
    'kappa_layer_ratio',
    'kappa_portal_to_global',
    'forget_lambda',
    'delta_prac_score',
    'delta_prac_pct',
    'lever_max',
    'lever_lb_level',
    'lever_min_section_calls',
] as const satisfies readonly AiAnalyticsParamCode[];

export const AI_ABOUT_ENDPOINT_TEXTS: Readonly<
    Record<AiAboutEndpoint, AiAboutEndpointText>
> = {
    overview: {
        endpoint: 'overview',
        title: 'Обзор менеджер × тип',
        purpose:
            'Оценки разборов по типам звонков, рёбра воронки с нормой ' +
            'портала, рычаги и готовность витрины за период.',
        sources: [
            'разборы звонков (ais, agent-analysis) за период в TZ портала',
            'KPI-список sales_kpi (план-факт звонков и презентаций)',
            'финансы закрытых сделок и живой пайплайн',
            'месячная модель портала (нормы μ, κ) и прогнозы менеджеров из ais',
        ],
        howToRead: [
            'n меньше порога n_min_none — числа нет, показывается «мало данных»',
            'ребро воронки: своя доля, норма портала и вес данных w ∈ [0; 1]',
            'разрыв к норме меньше практического порога — направления нет',
            'режим готовности с причинами — в баннере; без модели портала не выше descriptive',
        ],
        notDoing: [
            'не ставит менеджерам рейтинг и не сравнивает людей по стилю',
            'не утверждает причинность: связь «качество → исход» до оценки β — гипотеза',
        ],
        params: [
            ...SHARED_PARAMS,
            ...NORM_PARAMS,
            'kappa_boot_ratio',
            'calibration_min_months',
            'calibration_min_presentations',
            'roster_confirm_required',
        ],
    },
    'plan/daily': {
        endpoint: 'plan/daily',
        title: 'План дня менеджера',
        purpose:
            'Обратная задача от цели месяца: сколько входной активности ' +
            'нужно до конца месяца с учётом пайплайна, зрелости лага и потолка дня.',
        sources: [
            'снапшот прогноза дня (P50, λ_pipe, λ_new, утечки рёбер)',
            'месячная модель портала (θ рёбер, шкала лага F(d), потолок cap)',
            'месяц менеджера (Y₀, входная активность, план руководителя)',
        ],
        howToRead: [
            'G → Y₀ → λ_pipe → N_req → разворот по рёбрам → потолок дня',
            'λ_pipe = null с причиной — истории стадий нет, а не «пайплайн пуст»',
            'рычаг объёма выдаётся только с 80 %-интервалом эффекта',
        ],
        notDoing: [
            'не назначает план руководителя — берёт его из CRM или цели уровня',
            'не меняет потолок дня: множитель plan_day_ceiling — решение портала',
        ],
        params: [
            ...SHARED_PARAMS,
            ...NORM_PARAMS,
            'plan_day_ceiling',
            'f_min',
            'cycle_median_days',
            'lag_window_sale_days',
            'lag_cdf_F',
            'cif_sale_inf',
            'cap_quantile',
            'day_hours',
            's_ref',
            's_req_max',
            'lever_samples',
            'fte_share_default',
            'absence_proxy_min_run',
            'min_workdays_month',
        ],
    },
    brief: {
        endpoint: 'brief',
        title: 'AI-резюме периода',
        purpose:
            'Короткий текст по пакету фактов витрины: числа считает код, ' +
            'модель только формулирует; каждая цифра проходит факт-чек.',
        sources: [
            'пакет фактов обзора за период (хэш пакета — ключ кэша)',
            'VibeCode (LLM) при наличии ключа и квоты; иначе шаблон',
        ],
        howToRead: [
            'source = template — ключа нет, квота исчерпана или факт-чек не пройден; причина в ответе',
            'стоп-слова и каузальные обороты в тексте запрещены — их ловит факт-чек',
        ],
        notDoing: [
            'не считает новых чисел: только числа из пакета фактов',
            'не пишет о менеджере вне периметра запросившего',
        ],
        params: [...SHARED_PARAMS, 'brief_quota_per_day', 'llm_price_per_1k'],
    },
    'manager/style': {
        endpoint: 'manager/style',
        title: 'Карточка стиля менеджера',
        purpose:
            'Как человек работает: оси с двумя законными полюсами, ' +
            'отклонение от нормы коллег с интервалом 80 %, подписи-факты.',
        sources: [
            'снапшот стиля за месячное окно (ночной шаг конвейера)',
            'маркеры стиля из разборов и жёсткие счётчики телефонии и CRM',
        ],
        howToRead: [
            'рейтинга по осям нет: обе стороны оси нейтральны',
            'меньше style_min_calls разборов или мало коллег — «данных для стиля пока мало»',
            'подпись выдаётся при p_out ≥ style_p_out и снимается при p_in ≤ style_p_in',
        ],
        notDoing: [
            'не входит в нормы, цели и премии',
            'не профилирует сотрудника из ai_analytics_style_opt_out',
        ],
        params: [
            ...SHARED_PARAMS,
            'style_min_calls',
            'style_min_peers',
            'style_p_in',
            'style_p_out',
            'style_rope_delta',
            'style_tenure_kappa',
            'style_z_raw',
            'style_interval_z',
            'style_dispersion_min_days',
        ],
    },
};
