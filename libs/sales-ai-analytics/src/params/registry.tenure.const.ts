import type { ParamDescriptor } from './registry.types';

/**
 * Часть реестра: полосы стажа, ramp новичка и capacity
 * (план 4.6, 4.9; анкета Ж). Собирается в `registry.const.ts`.
 */
export const AI_ANALYTICS_TENURE_PARAMS = [
    {
        code: 'tenure_bands',
        title: 'Полосы стажа для норм',
        scope: 'global',
        source: 'configured',
        unit: 'месяцев стажа, границы через «/»',
        defaultValue: '0-6/6-18/18+',
        phase: 2,
        breaksSeries: true,
        description:
            'Нормы и capacity стратифицируются по стажу из «since», а не по уровню РОПа: уровень назначается по результатам и делает норму junior средним слабых, пряча разрыв. Смена границ рвёт сравнимость норм.',
    },
    {
        code: 'tenure_gates',
        title: 'Ворота стажа для подсказки уровня',
        scope: 'portal',
        source: 'configured',
        unit: 'месяцев: junior до / senior от',
        defaultValue: '6/18',
        phase: 2,
        breaksSeries: false,
        description:
            'Подсказка уровня: junior — стаж менее 6 месяцев, senior — не раньше 18. Уровень назначает РОП, система только подсказывает и никогда не понижает автоматически.',
    },
    {
        code: 'ramp_tau0_months',
        title: 'Характерное время выхода новичка τ₀',
        scope: 'global',
        source: 'hybrid',
        unit: 'месяцев',
        defaultValue: 3,
        range: [1, 8],
        phase: 3,
        breaksSeries: false,
        prior: 3,
        estimator: 'grid-search МНК τ₀ ∈ [1; 8] по качеству Ŝ и конверсии E2',
        minN: 8,
        gate: 'когорта ≥ 8 новичков со стажем < 12 мес. (пул, ITT)',
        description:
            'R(τ) = 1 − exp(−τ/τ₀) — доля выхода на режим к стажу τ. На одном портале τ₀ не идентифицируется и остаётся настроенным прайором с подписью «не калибровано».',
    },
    {
        code: 'ramp_volume_boost',
        title: 'Надбавка новичку к цели по объёму',
        scope: 'portal',
        source: 'configured',
        unit: 'доля цели',
        defaultValue: 0.3,
        range: [0, 0.6],
        phase: 2,
        breaksSeries: false,
        description:
            'Множитель (1 + boost·(1 − R(τ))) применяется к цели менеджера, а не к норме отдела: политика РОПа не должна искажать оценку нормы полосы стажа.',
    },
    {
        code: 'cap_level_activity',
        title: 'Capacity: потолок дневного темпа по типу активности',
        scope: 'tenure',
        source: 'hybrid',
        unit: 'активностей в день, карта «тип:значение»',
        defaultValue: 'cold:40,call:25,presentation:3',
        phase: 2,
        breaksSeries: false,
        estimator: 'p90 дневного темпа полосы стажа по менеджер-дням',
        minN: 3,
        gate: '≥ 3 менеджера × 3 месяца без proxy-месяцев',
        description:
            'Связующее ограничение плана: первое ребро, где N_k/D_rem выше потолка, делает цель недостижимой объёмом. До оценки p90 берутся дефолты холодный 40 / звонок 25 / презентация 3 в день.',
    },
] as const satisfies readonly ParamDescriptor[];
