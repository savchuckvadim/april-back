import type { ParamDescriptor } from './registry.types';

/**
 * Часть реестра Фазы 4: пул порталов и эффект советов — окна «до/после»,
 * гейт ступени «советы с эффектом» (план §4.10, §4.11, §10 L5). Вынесено
 * из `registry.phase4.const.ts` по лимиту 300 строк; собирается в
 * `registry.const.ts`.
 */
export const AI_ANALYTICS_PHASE4_ADVICE_PARAMS = [
    {
        code: 'pool_min_history_months',
        title: 'Минимум истории портала для пула',
        scope: 'global',
        source: 'configured',
        unit: 'месяцев',
        defaultValue: 6,
        range: [3, 24],
        phase: 4,
        breaksSeries: false,
        description:
            'Портал входит в пул только с датированным согласием и историей модели не короче этого числа месяцев (план §4.11, квартальный ритм).',
        userTitle:
            'Сколько истории нужно порталу для участия в общей статистике',
        userDescription:
            'В общую обезличенную статистику попадают только порталы с достаточной историей.',
    },
    {
        code: 'lever_effect_months_before',
        title: 'Окно «до» для эффекта советов',
        scope: 'global',
        source: 'configured',
        unit: 'месяцев',
        defaultValue: 2,
        range: [1, 6],
        phase: 4,
        breaksSeries: false,
        description:
            'Сколько месяцев до месяца выдачи совета берётся в базу сравнения долей КП и счетов (план §10, L5: before/after с интервалом Уилсона).',
        userTitle: 'Сколько месяцев до совета берём для сравнения',
        userDescription:
            'Результаты до совета сравниваются с результатами после него за одинаковое число месяцев.',
    },
    {
        code: 'lever_effect_months_after',
        title: 'Окно «после» для эффекта советов',
        scope: 'global',
        source: 'configured',
        unit: 'месяцев',
        defaultValue: 2,
        range: [1, 6],
        phase: 4,
        breaksSeries: false,
        description:
            'Сколько месяцев после месяца выдачи совета нужно дождаться, чтобы сравнить доли КП и счетов до и после (план §10, L5).',
        userTitle: 'Сколько месяцев после совета ждём результата',
        userDescription:
            'Эффект совета оценивается только когда после него прошло достаточно месяцев.',
    },
    {
        code: 'recommendations_min_issued',
        title: 'Минимум выданных советов для оценки эффекта',
        scope: 'global',
        source: 'configured',
        unit: 'советов',
        defaultValue: 20,
        range: [5, 200],
        phase: 4,
        breaksSeries: false,
        description:
            'Меньше этого числа советов с завершённым окном «после» оценка эффекта отдаёт «недостаточно данных» (план §10, L5).',
        userTitle: 'Сколько советов нужно, чтобы судить об их пользе',
        userDescription:
            'Считаются только советы, после которых уже прошло время для сравнения «до и после»; пока таких мало, эффект не оценивается.',
    },
    {
        code: 'recommendations_done_share_min',
        title: 'Минимальная доля выполненных советов',
        scope: 'global',
        source: 'configured',
        unit: 'доля',
        defaultValue: 0.5,
        range: [0.1, 1],
        phase: 4,
        breaksSeries: false,
        description:
            'Гейт L5 (план §10): нижняя граница 90 %-интервала Уилсона доли советов, отмеченных выполненными, должна быть не ниже порога.',
        userTitle: 'Какая доля советов должна выполняться',
        userDescription:
            'Советы считаются рабочими, если с учётом разброса можно уверенно сказать, что выполняется не меньше этой доли; при небольшом числе советов для этого нужна доля заметно выше порога.',
    },
    {
        code: 'recommendations_disagree_max',
        title: 'Максимальная доля несогласий с советами',
        scope: 'global',
        source: 'configured',
        unit: 'доля',
        defaultValue: 0.3,
        range: [0.05, 0.6],
        phase: 4,
        breaksSeries: false,
        description:
            'Контроль плана §4.10: доля «не согласен» по виду совета должна быть ниже порога, иначе ступень «рекомендации» не включается.',
        userTitle: 'Сколько несогласий допустимо',
        userDescription:
            'Ступень советов с эффектом открывается, только если с учётом разброса можно уверенно сказать, что несогласий меньше этой доли.',
    },
] as const satisfies readonly ParamDescriptor[];
