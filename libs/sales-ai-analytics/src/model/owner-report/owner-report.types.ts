import type { AnalyticsCallLiteRow } from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import type { CallReportOutcomeCode } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-report-facts.type';
import type { QualityLinkSnapshot } from '../../contracts/snapshot.phase4.types';
import type { MinDurationSecByType } from '../pulse-duration';
import type { WorkCalendar } from '../workdays.util';

/**
 * Факты отчёта собственнику за период (постановка
 * ai/tasks/2026-11-06-owner-period-report.md, §4): только числа и коды,
 * без текста. Текст и выводы делает формулировщик (этап 3) по этим фактам.
 *
 * Правило владельца 06.11.2026: никаких «мало данных» вместо чисел — доли
 * считаются при любом n > 0 и несут свой n; null только при n = 0.
 */

/** Группы типов звонков отчёта (как у образца: вход, показ, дожим…). */
export const OWNER_REPORT_TYPE_GROUPS = [
    'cold',
    'site_lead',
    'presentation',
    'followup',
    'reactivation',
    'event_invite',
    'other',
] as const;
export type OwnerReportTypeGroup = (typeof OWNER_REPORT_TYPE_GROUPS)[number];

export type OwnerReportOutcome = CallReportOutcomeCode;

/** Доля с числителем и знаменателем; pct = null только при n = 0. */
export interface OwnerShare {
    successes: number;
    n: number;
    pct: number | null;
}

/** Вид отчётного периода. */
export type OwnerReportPeriodKind = 'month' | 'quarter' | 'half_year' | 'year';

export interface OwnerReportPeriod {
    kind: OwnerReportPeriodKind;
    /** Первый и последний день периода, YYYY-MM-DD в TZ портала. */
    from: string;
    to: string;
    timeZone: string;
    calendar: WorkCalendar;
}

/**
 * Откуда известен отказ клиента: финал сделки «ОП Основная» (основной
 * источник), запись «ОП История» типа «Отказ», поля сделки («Нет
 * перспектив», «ОП Причина Отказа», «Не интересует») — вторичные.
 */
export const OWNER_REPORT_REFUSAL_SOURCES = [
    'stage',
    'history',
    'fields',
] as const;
export type OwnerReportRefusalSource =
    (typeof OWNER_REPORT_REFUSAL_SOURCES)[number];

/** Возвраты периода и по какому источнику виден отказ у каждого. */
export interface OwnerReportReactivationFacts {
    calls: number;
    bySource: Record<OwnerReportRefusalSource, number>;
}

/** Строка входа: lite-строка звонка + признаки, которые знает приложение. */
export interface OwnerReportCallInput extends AnalyticsCallLiteRow {
    /** Звонок клиенту, который раньше отказывал или ушёл (по CRM). */
    reactivation?: boolean;
    /** Источник отказа у возврата; нет — финал сделки. */
    reactivationSource?: OwnerReportRefusalSource;
}

/** Итоги телефонии за период (voximplant), если приложение их отдало. */
export interface OwnerReportTelephonyFacts {
    /** Исходящих вызовов всего. */
    outbound: number | null;
    /** Состоявшихся разговоров (длительность ≥ 1 с). */
    connected: number | null;
    /** Разговоров короче порога портала. */
    short: number | null;
}

/** Факты CRM по менеджеру за период (этап 4 — загрузчики приложения). */
export interface OwnerReportCrmManagerFacts {
    deals: number;
    invoices: number;
    presentations: number;
    /**
     * План «Месячная сумма продаж» блока «Планы», пересчитанный на даты
     * периода; null — план не задан или показатель выключен на портале.
     */
    plan: number | null;
    /** Месячная сумма продаж по закрытым сделкам периода; null — финансов нет. */
    salesAmount: number | null;
}

export interface OwnerReportCrmFacts {
    byManager: Readonly<Record<string, OwnerReportCrmManagerFacts>>;
    /** Средняя сумма договора по закрытым сделкам периода; null — сделок нет. */
    avgCheck: number | null;
}

export interface OwnerReportOptions {
    /** Порог длительности по типам (реестр `min_duration_sec_by_type`). */
    minDurationByType?: MinDurationSecByType;
    /** Менеджеры отдела (Bitrix ID): строки чужих не попадают в отчёт. */
    managerIds?: readonly string[];
    telephony?: OwnerReportTelephonyFacts | null;
    crm?: OwnerReportCrmFacts | null;
    /** Последний снапшот связи «качество показа → счёт/КП»; null — его нет. */
    qualityLink?: QualityLinkSnapshot | null;
}

/** Нормализованный звонок отчёта — единица всех счётчиков. */
export interface OwnerReportCall {
    transcriptionId: string;
    managerId: string;
    /** День звонка в TZ портала. */
    date: string;
    /** Понедельник ISO-недели звонка. */
    weekKey: string;
    callType: string | null;
    typeGroup: OwnerReportTypeGroup;
    /**
     * В разборе есть факты focus-v3.1: исход, сбои, цены, допродажа, темы
     * возражений. Старый разбор их не знает — такие признаки у него null,
     * а не «нет»: в доли они не входят (иначе ноль вместо «не размечено»).
     */
    marked: boolean;
    /** Исход разговора из разбора; null — не размечен (старый разбор). */
    outcome: OwnerReportOutcome | null;
    /**
     * Разговор с тем, кто решает: по исходу, а у старого разбора — по
     * собеседнику (ЛПР или пользователь — да, секретарь — нет); null — неизвестно.
     */
    contactReached: boolean | null;
    /** Шаг вперёд (исход advanced); null — исход не размечен. */
    advanced: boolean | null;
    nextStepSet: boolean;
    nextStepDated: boolean;
    nextStepKind: string | null;
    objections: OwnerReportObjection[];
    /** Сбои не по вине разговора; null — не размечены. */
    issues: string[] | null;
    prices: OwnerReportPrice[];
    upsellAttempted: boolean | null;
    needsFound: boolean | null;
    /** Презентация под потребности (спирали методики или показ после потребностей). */
    presentationByNeeds: boolean | null;
    /** Попытка закрытия: раздел CLOSING применим и оценён не ниже 5. */
    closingAttempted: boolean | null;
    conflict: boolean;
    /** Ушёл от ответа на «вы что-то предлагаете?»; null — не размечено. */
    evasive: boolean | null;
    score: number | null;
    /** Оценки разделов разбора 1–10 по коду раздела; только применимые разделы. */
    sectionScores: Readonly<Record<string, number>>;
    /** Источник отказа у возврата; null — не возврат. */
    reactivationSource: OwnerReportRefusalSource | null;
}

export interface OwnerReportObjection {
    /** Тема возражения; null — старый разбор темы не размечал. */
    topic: string | null;
    handled: boolean | null;
    /** continued / converted / disengaged / null. */
    outcome: string | null;
}

export interface OwnerReportPrice {
    amount: number;
    periodMonths: number | null;
    kind: string | null;
    /** amount / periodMonths; null без срока. */
    perMonth: number | null;
}

export interface OwnerReportCoverage {
    /** Строк звонков за период в периметре отдела. */
    calls: number;
    /** С глубоким разбором (единица счётчиков ниже). */
    analyzed: number;
    /** Короче порога портала (без разбора или вне слоя качества). */
    short: number;
    noManager: number;
    noAnalysis: number;
    /** С размеченным исходом / без него (старый разбор до focus-v3.1). */
    outcomeFromAnalysis: number;
    outcomeUnmarked: number;
    /** Первый день периода с фактами focus-v3.1 (null — таких разборов нет). */
    factsSince: string | null;
    /** Рабочие дни периода без единого звонка. */
    silentWorkdays: string[];
    telephony: OwnerReportTelephonyFacts | null;
}

export interface OwnerReportOutcomes {
    byOutcome: Record<OwnerReportOutcome, number>;
    /** Разговоров без размеченного исхода — в доли исходов не входят. */
    unmarked: number;
    /** Разговоров с тем, кто решает. */
    contacted: number;
    advancedOfContacted: OwnerShare;
    /** Среди отложенных и перезвонов — доля с датой. */
    postponedWithDate: OwnerShare;
}

export interface OwnerReportTypeGroupRow {
    group: OwnerReportTypeGroup;
    calls: number;
    byOutcome: Record<OwnerReportOutcome, number>;
    /** Звонков группы без размеченного исхода. */
    unmarked: number;
    /** Продвинутых от звонков группы с размеченным исходом. */
    advancedOfAll: OwnerShare;
    /** Продвинутых от разговоров с ЛПР. */
    advancedOfContacted: OwnerShare;
}

export interface OwnerReportWeek {
    weekKey: string;
    from: string;
    to: string;
    /** Неделя выходит за границы периода. */
    partial: boolean;
    calls: number;
    cold: number;
    coldAdvanced: OwnerShare;
    contacted: number;
    contactedAdvanced: OwnerShare;
    /** Рабочих дней недели без звонков (разрывы данных). */
    silentWorkdays: string[];
}

export * from './owner-report.sections.types';
