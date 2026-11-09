import {
    CALL_REPORT_ISSUE_ITEMS,
    CALL_REPORT_OBJECTION_TOPIC_ITEMS,
    CALL_REPORT_OUTCOME_ITEMS,
} from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-report-facts.type';
import { CALL_REPORT_SECTIONS } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import type {
    OwnerReportFunnelStageCode,
    OwnerReportLeakCode,
    OwnerReportLeakNature,
    OwnerReportOutcome,
    OwnerReportPeriodKind,
    OwnerReportSignVerdict,
    OwnerReportTypeGroup,
} from '../owner-report.types';

/**
 * Русские подписи кодов отчёта собственнику. Тексты читает собственник —
 * без английских кодов, формул и жаргона (правило владельца). Подписи
 * справочников звонка берутся из их ITEMS, остальное — здесь.
 */

const itemLabels = (
    items: readonly { CODE: string; VALUE: string }[],
): Readonly<Record<string, string>> =>
    Object.fromEntries(items.map(item => [item.CODE, item.VALUE]));

export const OUTCOME_LABELS: Readonly<Record<OwnerReportOutcome, string>> =
    itemLabels(CALL_REPORT_OUTCOME_ITEMS) as Record<OwnerReportOutcome, string>;

/** Строка таблицы исходов для разговоров старого разбора. */
export const UNMARKED_OUTCOME_LABEL = 'Исход не размечен (старый разбор)';

export const TOPIC_LABELS = itemLabels(CALL_REPORT_OBJECTION_TOPIC_ITEMS);
export const ISSUE_LABELS = itemLabels(CALL_REPORT_ISSUE_ITEMS);

export const TYPE_GROUP_LABELS: Readonly<Record<OwnerReportTypeGroup, string>> =
    {
        cold: 'Холодный первый контакт',
        site_lead: 'Заявка с сайта',
        presentation: 'Показ системы',
        followup: 'Дожим: доработка, решение, оплата',
        reactivation: 'Возврат ушедших и отказавших',
        event_invite: 'Приглашение на мероприятие',
        other: 'Прочие разговоры',
    };

export const PERIOD_KIND_LABELS: Readonly<
    Record<OwnerReportPeriodKind, string>
> = {
    month: 'месяц',
    quarter: 'квартал',
    half_year: 'полугодие',
    year: 'год',
};

export const NATURE_LABELS: Readonly<Record<OwnerReportLeakNature, string>> = {
    process: 'Процесс: правила и данные, а не люди',
    skill: 'Навык: разговор менеджера',
    both: 'Процесс и навык вместе',
};

export interface LeakLabel {
    title: string;
    /** Чем заканчивается знаменатель масштаба: «…разговоров дожима». */
    base: string;
    /** Что сделать — одно действие. */
    action: string;
}

export const LEAK_LABELS: Readonly<Record<OwnerReportLeakCode, LeakLabel>> = {
    followup_no_decision: {
        title: 'Дожим не закрывается: после показа и предложения клиент уходит в «подумаем»',
        base: 'разговоров дожима без решения',
        action: 'Ввести правило закрытия: каждый разговор дожима заканчивается решением или датой возврата, разбор таких звонков — на планёрке раз в неделю.',
    },
    postponed_no_date: {
        title: 'Отложено без даты возврата',
        base: 'разговоров с ЛПР отложены без даты',
        action: 'Требовать дату следующего контакта в CRM по каждому отложенному разговору и проверять хвосты раз в неделю.',
    },
    cold_no_contact: {
        title: 'Холодный вход упирается в секретаря и базу',
        base: 'холодных звонков без разговора с ЛПР',
        action: 'Почистить базу от дублей и отказавших, переписать повод звонка для секретаря, вести выход на ЛПР как отдельную цель.',
    },
    objections_unhandled: {
        title: 'Возражения остаются без ответа',
        base: 'разговоров с возражением, где его не отработали',
        action: 'Собрать ответы на три самых частых возражения месяца и разобрать их с менеджерами на примерах звонков.',
    },
    presentation_without_needs: {
        title: 'Показ без задач клиента',
        base: 'показов без выявленных задач клиента',
        action: 'Начинать показ с вопросов о задачах клиента; показ «по шаблону» разбирать с менеджером по записи.',
    },
};

export interface SignLabel {
    title: string;
    /** Что значит вердикт, словами собственника. */
    yes: string;
    partial: string;
    no: string;
}

export const SIGN_LABELS: Readonly<Record<string, SignLabel>> = {
    repeatability: {
        title: 'Повторяемость результата',
        yes: 'показ стабильно двигает клиента дальше',
        partial: 'показ двигает клиента дальше не всегда',
        no: 'результат показа случаен',
    },
    people_dependency: {
        title: 'Зависимость от людей',
        yes: 'продвижения распределены по команде',
        partial: 'заметная доля продвижений — на одном сотруднике',
        no: 'результат держится на одном сотруднике',
    },
    stage_control: {
        title: 'Контроль следующего шага',
        yes: 'большинство разговоров заканчивается шагом с датой',
        partial: 'шаг с датой — меньше чем в половине разговоров',
        no: 'следующий шаг почти не фиксируется',
    },
    needs_discovery: {
        title: 'Выявление задач клиента',
        yes: 'задачи клиента выясняют в большинстве разговоров',
        partial: 'задачи клиента выясняют не всегда',
        no: 'задачи клиента почти не выясняют',
    },
    upsell: {
        title: 'Допродажа',
        yes: 'больше, чем просил клиент, предлагают регулярно',
        partial: 'допродажу предлагают редко',
        no: 'допродажи почти нет',
    },
    base_quality: {
        title: 'Качество базы и CRM',
        yes: 'дубли и ошибки контактов единичны',
        partial: 'дубли и ошибки контактов встречаются',
        no: 'дубли и ошибки контактов мешают продажам',
    },
    objections_handling: {
        title: 'Работа с возражениями',
        yes: 'большинство возражений отрабатывается',
        partial: 'отрабатывается около половины возражений',
        no: 'возражения чаще остаются без ответа',
    },
    plan_fact: {
        title: 'План продаж',
        yes: 'план выполнен',
        partial: 'план выполнен не полностью',
        no: 'план далёк от выполнения',
    },
};

export const SIGN_VERDICT_LABELS: Readonly<
    Record<OwnerReportSignVerdict, string>
> = {
    yes: 'Есть',
    partial: 'Частично',
    no: 'Нет',
    unknown: 'Не проверялось',
};

export const MANAGEMENT_VERDICT_LABELS = {
    managed: 'Отдел управляется',
    partial: 'Управляется частично',
    not_managed: 'Продажи не управляются',
} as const;

export interface MetricLabel {
    title: string;
    why: string;
    ifIgnored: string;
}

export const METRIC_LABELS: Readonly<Record<string, MetricLabel>> = {
    postponed_with_date: {
        title: 'Доля отложенных разговоров с датой возврата',
        why: 'Показывает, сохраняются ли уже оплаченные контакты',
        ifIgnored: 'Треть работы продолжит превращаться в тихие отказы',
    },
    followup_to_advanced: {
        title: 'Дожим: доля разговоров с решением или шагом вперёд',
        why: 'Единственный этап, где возникают деньги',
        ifIgnored: 'Затраты на холодный вход и показы не окупаются',
    },
    cold_to_advanced: {
        title: 'Холодный звонок: дошли до показа, доступа или предложения',
        why: 'Определяет, сколько нового спроса заходит в воронку',
        ifIgnored: 'Через несколько месяцев дожимать будет некого',
    },
    crm_issues: {
        title: 'Доля разговоров с ошибками базы и CRM',
        why: 'Каждый дубль — раздражённый клиент и потерянное время',
        ifIgnored: 'Рост жалоб и отказов «не звоните больше»',
    },
    top_manager_share: {
        title: 'Доля одного сотрудника в продвижениях',
        why: 'Мера зависимости бизнеса от конкретного человека',
        ifIgnored: 'Уход или выгорание одного менеджера обрушит результат',
    },
};

/** Ступени воронки по разговорам. */
export const FUNNEL_STAGE_LABELS: Readonly<
    Record<OwnerReportFunnelStageCode, string>
> = {
    cold: 'Холодный первый контакт',
    presentation: 'Показ системы',
    followup: 'После показа и КП: доработка, решение, оплата',
};

/** Разделы разбора разговора — названия из справочника смарта. */
export const SECTION_LABELS: Readonly<Record<string, string>> =
    Object.fromEntries(
        CALL_REPORT_SECTIONS.map(section => [section.code, section.title]),
    );
