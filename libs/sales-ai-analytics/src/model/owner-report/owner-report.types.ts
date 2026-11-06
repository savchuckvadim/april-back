import type { AnalyticsCallLiteRow } from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import type { CallReportOutcomeCode } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-report-facts.type';
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

/** Откуда взят исход: из разбора (focus-v3.1+) или выведен по старым полям. */
export type OwnerReportOutcomeSource = 'analysis' | 'derived';

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

/** Строка входа: lite-строка звонка + признаки, которые знает приложение. */
export interface OwnerReportCallInput extends AnalyticsCallLiteRow {
    /** Звонок клиенту, который раньше отказывал или ушёл (по CRM). */
    reactivation?: boolean;
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
    outcome: OwnerReportOutcome;
    outcomeSource: OwnerReportOutcomeSource;
    /** Разговор состоялся с тем, кто решает (исход ≠ no_contact). */
    contactReached: boolean;
    advanced: boolean;
    nextStepSet: boolean;
    nextStepDated: boolean;
    nextStepKind: string | null;
    objections: OwnerReportObjection[];
    issues: string[];
    prices: OwnerReportPrice[];
    upsellAttempted: boolean | null;
    needsFound: boolean | null;
    /** Презентация под потребности (спирали методики или показ после потребностей). */
    presentationByNeeds: boolean | null;
    /** Попытка закрытия: раздел CLOSING применим и оценён не ниже 5. */
    closingAttempted: boolean | null;
    conflict: boolean;
    /** Ушёл от ответа на «вы что-то предлагаете?». */
    evasive: boolean;
    score: number | null;
}

export interface OwnerReportObjection {
    topic: string;
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
    /** Исход из разбора / выведен по старым полям. */
    outcomeFromAnalysis: number;
    outcomeDerived: number;
    /** Первый день периода с фактами focus-v3.1 (null — таких разборов нет). */
    factsSince: string | null;
    /** Рабочие дни периода без единого звонка. */
    silentWorkdays: string[];
    telephony: OwnerReportTelephonyFacts | null;
}

export interface OwnerReportOutcomes {
    byOutcome: Record<OwnerReportOutcome, number>;
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
    /** Продвинутых от всех звонков группы. */
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
