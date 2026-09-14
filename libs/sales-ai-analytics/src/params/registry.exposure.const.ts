import { AI_MANAGER_STATUSES } from '../contracts/passport.types';
import {
    AI_LEAD_MIX_STRATA,
    AI_LEAD_STRATA_DIMENSIONS,
    AI_MANAGER_LEVELS,
    AI_WEEKDAY_CODES,
} from './registry.enums.const';
import type { ParamDescriptor } from './registry.types';

/** Рабочая неделя по умолчанию: понедельник — пятница (ISO 1..5). */
export const AI_WORKWEEK_DEFAULT = AI_WEEKDAY_CODES.slice(0, 5).join(',');

/**
 * Часть реестра: экспозиция и ростер — календарь портала, ставка, часы «на
 * трубке», уровень и статус менеджера, подтверждение состава (план §2.1,
 * коды time_zone … status_left_at, roster_confirm_required,
 * exclude_from_norms). Составные значения анкеты (отсутствия, праздники)
 * кодируются JSON-строкой по правилу «один код = один скаляр».
 * Собирается в `registry.const.ts`.
 */
export const AI_ANALYTICS_EXPOSURE_PARAMS = [
    {
        code: 'time_zone',
        title: 'Часовой пояс портала',
        scope: 'portal',
        source: 'configured',
        unit: 'IANA TZ',
        defaultValue: 'Europe/Moscow',
        phase: 1,
        breaksSeries: false,
        description:
            'Границы дня, недели и месяца для агрегатов, планов дня и рассылок; менеджер может переопределить свой пояс в карточке (timeZone). Формат — идентификатор IANA.',
    },
    {
        code: 'workweek',
        title: 'Рабочие дни недели',
        scope: 'portal',
        source: 'configured',
        unit: 'номера дней ISO через запятую (1 — понедельник)',
        defaultValue: AI_WORKWEEK_DEFAULT,
        phase: 1,
        breaksSeries: false,
        kind: 'csv',
        enumValues: AI_WEEKDAY_CODES,
        description:
            'Дни недели, входящие в знаменатель рабочих дней D_mt и в план дня; санити требует не меньше трёх дней. Менеджер может задать свой список в карточке (workweek).',
    },
    {
        code: 'holidays',
        title: 'Праздники календаря портала',
        scope: 'portal',
        source: 'configured',
        unit: 'JSON-массив дат YYYY-MM-DD',
        defaultValue: '[]',
        phase: 1,
        breaksSeries: false,
        kind: 'json',
        description:
            'Федеральные и региональные праздники, вычитаемые из рабочих дней; пустой список — календарь ещё не импортирован (готовность пишет calendar-not-imported). Санити: 15–23 рабочих дня в месяце.',
    },
    {
        code: 'absences',
        title: 'Отсутствия менеджера',
        scope: 'manager',
        source: 'configured',
        unit: 'JSON-массив отрезков {from, to, kind}',
        defaultValue: '[]',
        phase: 1,
        breaksSeries: false,
        kind: 'json',
        description:
            'Отпуска, больничные и обучение, вычитаемые из D_mt; без записей дни берутся прокси по событиям телефонии (daysSource = proxy). Даты не дальше today + 90, отрезки без пересечений; больше 60 дней — статус absent.',
    },
    {
        code: 'fte_share',
        title: 'Доля ставки менеджера',
        scope: 'manager',
        source: 'configured',
        unit: 'доля ставки',
        defaultValue: 1,
        range: [0.25, 1],
        phase: 2,
        breaksSeries: false,
        description:
            'Множитель к рабочим дням, capacity и плану дня: половина ставки — половина экспозиции, иначе норма отдела считала бы совместителя отстающим.',
    },
    {
        code: 'fte_share_default',
        title: 'Ставка менеджера по умолчанию',
        scope: 'manager',
        source: 'configured',
        unit: 'доля ставки',
        defaultValue: 1,
        range: [0.25, 1],
        phase: 2,
        breaksSeries: false,
        description:
            'Значение fte_share, пока в карточке менеджера ставка не задана: полная ставка. Слой менеджера кладёт сюда ту же величину, что и в fte_share.',
    },
    {
        code: 'day_hours',
        title: 'Часы «на трубке» в день',
        scope: 'portal',
        source: 'configured',
        unit: 'часов',
        defaultValue: 6,
        range: [2, 10],
        phase: 2,
        breaksSeries: false,
        description:
            'Бюджет времени плана дня и санити capacity: сумма длительностей активностей плана не должна превышать эти часы. Выводится из work_time_start/end портала, иначе 6.',
    },
    {
        code: 'level',
        title: 'Уровень менеджера',
        scope: 'manager',
        source: 'configured',
        unit: 'код уровня',
        defaultValue: AI_MANAGER_LEVELS[0],
        phase: 1,
        breaksSeries: false,
        kind: 'enum',
        enumValues: AI_MANAGER_LEVELS,
        description:
            'junior / middle / senior назначает руководитель (ai_analytics_levels); до назначения подсказывается по стажу через tenure_gates (source = default) и никогда не понижается автоматически. Дефолт реестра — запасной слой, когда стаж неизвестен.',
    },
    {
        code: 'since',
        title: 'Дата выхода в роль',
        scope: 'manager',
        source: 'configured',
        unit: 'дата YYYY-MM-DD',
        defaultValue: '',
        phase: 1,
        breaksSeries: false,
        description:
            'Начало стажа τ для ramp и ворот уровня: UF_EMPLOYMENT_DATE, иначе DATE_REGISTER, иначе прокси по первому звонку. Пустая строка — берётся паспорт менеджера; дата не позже сегодня.',
    },
    {
        code: 'manager_status',
        title: 'Статус менеджера',
        scope: 'manager',
        source: 'configured',
        unit: 'код статуса',
        defaultValue: AI_MANAGER_STATUSES[0],
        phase: 1,
        breaksSeries: false,
        kind: 'enum',
        enumValues: AI_MANAGER_STATUSES,
        description:
            'active / probation / absent / left (анкета Ж, status_left_at): ушедшие остаются в когортах ramp по принципу ITT, отсутствующие дольше 60 дней получают absent автоматически.',
    },
    {
        code: 'manager_left_at',
        title: 'Дата ухода менеджера',
        scope: 'manager',
        source: 'configured',
        unit: 'дата YYYY-MM-DD',
        defaultValue: '',
        phase: 1,
        breaksSeries: false,
        description:
            'Вторая половина status_left_at анкеты Ж: дата ухода при статусе left, пустая строка — менеджер работает. Дата не позже сегодня.',
    },
    {
        code: 'roster_confirm_required',
        title: 'Требовать подтверждение состава',
        scope: 'global',
        source: 'configured',
        unit: 'флаг',
        defaultValue: false,
        phase: 2,
        breaksSeries: false,
        description:
            'Гейт готовности «состав подтверждён»: при false хватает непустых уровней в ai_analytics_levels, при true нужна дата ai_analytics_roster_confirmed_at, иначе витрина остаётся в режиме descriptive с причиной roster-not-confirmed.',
    },
    {
        code: 'exclude_from_norms',
        title: 'Исключить менеджера из норм',
        scope: 'manager',
        source: 'configured',
        unit: 'флаг',
        defaultValue: false,
        phase: 2,
        breaksSeries: false,
        description:
            'Стажёр, наставник или особый профиль не входит в оценку норм μ, силы усадки κ и capacity отдела; собственные карточки менеджера при этом считаются как обычно.',
    },
    {
        code: 'level_hysteresis_up',
        title: 'Гистерезис подсказки уровня вверх',
        scope: 'global',
        source: 'configured',
        unit: 'месяцев подряд',
        defaultValue: 2,
        range: [1, 6],
        phase: 3,
        breaksSeries: false,
        description:
            'Сколько месяцев подряд менеджер должен быть выше квантиля 0,67 своей полосы, чтобы система предложила повысить уровень; решение остаётся за руководителем.',
    },
    {
        code: 'lead_kind_strata',
        title: 'Измерения страт качества базы',
        scope: 'portal',
        source: 'configured',
        unit: 'коды измерений через запятую',
        defaultValue: AI_LEAD_STRATA_DIMENSIONS.slice(0, 2).join(','),
        phase: 3,
        breaksSeries: false,
        kind: 'csv',
        enumValues: AI_LEAD_STRATA_DIMENSIONS,
        description:
            'По каким признакам лида стратифицируются сравнения и модели: вид работы с лидом × стадия основной сделки до звонка по умолчанию, дополнительно тип перспективы и размер компании; 2–6 страт.',
    },
    {
        code: 'lead_mix_stratum',
        title: 'Страта лидов менеджера',
        scope: 'manager',
        source: 'hybrid',
        unit: 'код страты',
        defaultValue: AI_LEAD_MIX_STRATA[0],
        phase: 2,
        breaksSeries: false,
        kind: 'enum',
        enumValues: AI_LEAD_MIX_STRATA,
        estimator: 'преобладающий op_lead_work_kind менеджера за 3 месяца',
        minN: 30,
        gate: '≥ 30 звонков с видом работы за 3 месяца, иначе cold',
        description:
            'Политика распределения лидов руководителем против факта: холодные, заявки или база. Доли страт в сумме дают 1 и оцениваются из данных; здесь — преобладающая страта для норм и сравнения.',
    },
    {
        code: 'level_hysteresis_down',
        title: 'Гистерезис подсказки уровня вниз',
        scope: 'global',
        source: 'configured',
        unit: 'месяцев подряд',
        defaultValue: 3,
        range: [1, 6],
        phase: 3,
        breaksSeries: false,
        description:
            'Сколько месяцев подряд ниже квантиля 0,33 нужно для подсказки о понижении; порог вниз выше порога вверх, чтобы подсказка не дёргалась от одного слабого месяца. Автоматического понижения нет.',
    },
] as const satisfies readonly ParamDescriptor[];
