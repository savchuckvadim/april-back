import type { ParamDescriptor } from './registry.types';

/**
 * Часть реестра: «стиль» менеджера — устойчивые поведенческие признаки
 * (документ `ai/tasks/ai-analytics-manager-style.md`, раздел 3.3).
 * Стиль — оценка, а не настройка: в нормы и цели он не входит, служит для
 * адресации коучинга и объяснений. Собирается в `registry.const.ts`.
 */
export const AI_ANALYTICS_STYLE_PARAMS = [
    {
        code: 'style_min_calls',
        title: 'Минимум разборов для подписи стиля',
        scope: 'portal',
        source: 'configured',
        unit: 'сравнимых разборов',
        defaultValue: 40,
        range: [30, 120],
        phase: 2,
        breaksSeries: false,
        description:
            'Гейт подписи «по данным» для менеджера; ниже — confidence: none с причиной few-calls. Коллеги входят в норму портала с n ≥ 20 разборов.',
    },
    {
        code: 'style_min_peers',
        title: 'Минимум коллег в норме стиля',
        scope: 'portal',
        source: 'configured',
        unit: 'менеджеров',
        defaultValue: 8,
        range: [5, 20],
        phase: 2,
        breaksSeries: false,
        description:
            'Сколько менеджеров с n ≥ 20 нужно для яруса «по данным». При 5–7 коллегах доступен только ярус «похоже» с подписью «только ориентир», при менее 5 — режим малой команды без сравнения с коллегами.',
    },
    {
        code: 'style_rope_delta',
        title: 'Полуширина области практической эквивалентности',
        scope: 'global',
        source: 'configured',
        unit: 'СКО стандартизованного остатка',
        defaultValue: 0.2,
        range: [0.15, 0.3],
        phase: 2,
        breaksSeries: false,
        description:
            'В документе ai/tasks/ai-analytics-manager-style.md — `style_tag_d_in`. ROPE вокруг нуля: p_ROPE = P(|δ| ≥ style_rope_delta). Отличие менеджера от коллег меньше этой величины считается практически нулевым и подписи не даёт.',
    },
    {
        code: 'style_p_in',
        title: 'Вероятность входа подписи стиля',
        scope: 'global',
        source: 'configured',
        unit: 'вероятность',
        defaultValue: 0.8,
        range: [0.7, 0.95],
        phase: 2,
        breaksSeries: false,
        description:
            'В документе ai/tasks/ai-analytics-manager-style.md — `style_tag_p_in`. Подпись «по данным» ставится при p_ROPE не ниже порога; для устойчивых признаков (настойчив, даёт время, слушает, быстрый) порог поднимается до 0,9 в style-tags.const.ts.',
    },
    {
        code: 'style_p_out',
        title: 'Вероятность выхода подписи стиля',
        scope: 'global',
        source: 'configured',
        unit: 'вероятность',
        defaultValue: 0.6,
        range: [0.5, 0.7],
        phase: 2,
        breaksSeries: false,
        description:
            'Гистерезис: уже выданная подпись снимается только когда p_ROPE опустится ниже этого значения — иначе профиль мигал бы между пересчётами.',
    },
    {
        code: 'style_z_raw',
        title: 'Частотный пол для подписи «по данным»',
        scope: 'global',
        source: 'configured',
        unit: 'стандартных ошибок',
        defaultValue: 2.33,
        range: [1.96, 3],
        phase: 2,
        breaksSeries: false,
        description:
            'В документе ai/tasks/ai-analytics-manager-style.md — `style_tag_z_floor`. Дополнительно к байесовскому критерию: |x̄ − μ_LOO|/SE_raw должно превышать порог, иначе подпись не выдаётся даже при высоком p_ROPE.',
    },
    {
        code: 'style_interval_z',
        title: 'Квантиль интервалов рядом с подписью стиля',
        scope: 'global',
        source: 'configured',
        unit: 'z-квантиль',
        defaultValue: 1.282,
        range: [1, 2],
        phase: 2,
        breaksSeries: false,
        description:
            'В профиле стиля везде один уровень интервалов — 80 % (z = 1,282): при n = 40 и доле 0,5 полуширина Уилсона составляет около 10 п.п. Частотный пол подписи задаёт style_z_raw.',
    },
    {
        code: 'style_dispersion_min_days',
        title: 'Минимум рабочих дней для индекса дисперсии',
        scope: 'portal',
        source: 'configured',
        unit: 'рабочих дней',
        defaultValue: 15,
        range: [10, 40],
        phase: 2,
        breaksSeries: false,
        description:
            'Ось rhythm (документ ai/tasks/ai-analytics-manager-style.md, §2.1 ось 8): индекс избыточной дисперсии дневных объёмов Var/mean − 1 считается только при стольких рабочих днях в окне; ниже — null, подписи по ритму нет. Читает style-crm.units.ts (жёсткие счётчики телефонии).',
    },
    // Пороги счётчиков телефонии и CRM (STYLE_CRM_THRESHOLDS, П11 Фазы 3,
    // 22.09.2026): определения единиц документа §2.1, scope global — портал
    // их не переопределяет и в ключ кэша style-crm-v2 они не входят.
    {
        code: 'style_conversation_min_sec',
        title: 'Минимальная длительность состоявшегося разговора',
        scope: 'global',
        source: 'configured',
        unit: 'секунд',
        defaultValue: 30,
        range: [10, 120],
        phase: 2,
        breaksSeries: false,
        description:
            'Оси persistence и tempo (документ ai/tasks/ai-analytics-manager-style.md, §2.1 оси 4 и 7): звонок телефонии с кодом 200 считается разговором от стольких секунд — попытки дозвона короче лид не «связывают» и в ряды длительностей не входят. Определение единицы, а не порог разбора min_duration_sec. Читает style-crm.units.ts (STYLE_CRM_THRESHOLDS.conversationMinSec).',
    },
    {
        code: 'style_tempo_min_sec',
        title: 'Минимальная длительность звонка в объёме рабочего дня',
        scope: 'global',
        source: 'configured',
        unit: 'секунд',
        defaultValue: 60,
        range: [30, 300],
        phase: 2,
        breaksSeries: false,
        description:
            'Ось tempo (документ ai/tasks/ai-analytics-manager-style.md, §2.1 ось 7, под-ось «дни»): в объём рабочего дня callsPerWorkday входят исходящие звонки длиннее стольких секунд — короткие недозвоны темп не создают. Читает style-crm.units.ts (STYLE_CRM_THRESHOLDS.tempoMinSec).',
    },
    {
        code: 'style_give_up_workdays',
        title: 'Срок второй попытки дозвона',
        scope: 'global',
        source: 'configured',
        unit: 'рабочих дней',
        defaultValue: 3,
        range: [1, 10],
        phase: 2,
        breaksSeries: false,
        description:
            'Ось persistence (документ ai/tasks/ai-analytics-manager-style.md, §2.1 ось 4): giveUpRate — доля лидов, у которых после первой попытки без разговора не было второй в столько рабочих дней по календарю портала; позже — лид считается брошенным. Читает style-crm.units.ts (STYLE_CRM_THRESHOLDS.giveUpWorkdays).',
    },
    {
        code: 'style_promise_window_days',
        title: 'Окно выполнения обещанной даты',
        scope: 'global',
        source: 'configured',
        unit: 'календарных дней',
        defaultValue: 2,
        range: [0, 7],
        phase: 2,
        breaksSeries: false,
        description:
            'Ось rhythm (документ ai/tasks/ai-analytics-manager-style.md, §2.1 ось 8): promiseKept — обещанная дата следующего шага считается выполненной, если звонок тому же клиенту состоялся в ±столько дней от неё. Читает style-crm.units.ts (STYLE_CRM_THRESHOLDS.promiseWindowDays).',
    },
    {
        code: 'style_tenure_kappa',
        title: 'Сила усадки оффсета полосы стажа',
        scope: 'global',
        source: 'configured',
        unit: 'менеджеров',
        defaultValue: 5,
        range: [3, 10],
        phase: 2,
        breaksSeries: false,
        description:
            'Оффсет β_band полосы стажа стягивается к нулю с этой силой: без стажа оффсет равен нулю и в «Как считаем» пишется причина no-tenure.',
    },
] as const satisfies readonly ParamDescriptor[];
