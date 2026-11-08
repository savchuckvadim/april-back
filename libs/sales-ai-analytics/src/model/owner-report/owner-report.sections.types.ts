import type {
    OwnerReportCoverage,
    OwnerReportCrmManagerFacts,
    OwnerReportOutcomes,
    OwnerReportPeriod,
    OwnerReportTypeGroupRow,
    OwnerReportWeek,
    OwnerShare,
} from './owner-report.types';

/**
 * Типы разделов отчёта собственнику: возражения, сбои, деньги, утечки,
 * управляемость, метрики контроля, сотрудники и итоговый пакет фактов.
 * Вынесено из owner-report.types.ts по лимиту файла; реэкспорт оттуда же.
 */

export interface OwnerReportObjectionTopicRow {
    topic: string;
    /** Возражений темы / звонков с темой. */
    n: number;
    calls: number;
    handled: OwnerShare;
    /** Звонков с темой, где разговор в итоге продвинут. */
    advancedAfter: OwnerShare;
}

export interface OwnerReportObjections {
    /** Звонков с хотя бы одним возражением среди разговоров с ЛПР. */
    callsWithObjections: OwnerShare;
    handled: OwnerShare;
    byTopic: OwnerReportObjectionTopicRow[];
    /** Возражений без темы (старый разбор) — в таблицу тем не входят. */
    topicUnmarked: number;
    /** Темы среди холодных без продвижения: что чаще всего останавливает вход. */
    coldNotAdvancedTop: { topic: string; calls: number }[];
}

export interface OwnerReportIssueRow {
    code: string;
    calls: number;
    /** До трёх звонков-примеров. */
    examples: string[];
}

export interface OwnerReportIssues {
    /** Знаменатель — разговоры с размеченными сбоями (focus-v3.1). */
    callsWithIssues: OwnerShare;
    byCode: OwnerReportIssueRow[];
}

export interface OwnerReportPriceRange {
    min: number;
    max: number;
    n: number;
}

export interface OwnerReportPrices {
    n: number;
    /** Разброс обычных цен в пересчёте на месяц и на год; null — цен нет. */
    listPerMonth: OwnerReportPriceRange | null;
    listPerYear: OwnerReportPriceRange | null;
    promoPerMonth: OwnerReportPriceRange | null;
    /** Разброс по срокам, как прозвучало: 1, 3, 12 месяцев. */
    byPeriod: { periodMonths: number; range: OwnerReportPriceRange }[];
    /** Оценка одной сделки для денег утечек и её основание. */
    dealValue: { amount: number; basis: 'crm' | 'prices' } | null;
}

export type OwnerReportLeakCode =
    | 'followup_no_decision'
    | 'postponed_no_date'
    | 'cold_no_contact'
    | 'objections_unhandled'
    | 'presentation_without_needs';

export type OwnerReportLeakNature = 'process' | 'skill' | 'both';

export interface OwnerReportLeak {
    code: OwnerReportLeakCode;
    /** Масштаб: сколько звонков и доля от своего знаменателя. */
    scale: OwnerShare;
    /** Деньги: оценка и основание; null — деньги не считаются. */
    money: {
        amount: number;
        basis: 'crm' | 'prices';
        /** Сколько сделок положено в оценку (напр. каждый десятый). */
        deals: number;
    } | null;
    nature: OwnerReportLeakNature;
    /** До трёх звонков-примеров. */
    examples: string[];
}

export type OwnerReportSignVerdict = 'yes' | 'partial' | 'no' | 'unknown';

export interface OwnerReportSign {
    code: string;
    verdict: OwnerReportSignVerdict;
    /** Значение, по которому вынесен вердикт (доля или отношение). */
    value: number | null;
    n: number;
}

export interface OwnerReportManagement {
    signs: OwnerReportSign[];
    verdict: 'managed' | 'partial' | 'not_managed';
}

export interface OwnerReportControlMetric {
    code: string;
    share: OwnerShare;
    /** То же за последнюю полную неделю периода; null — недели нет. */
    lastWeek: OwnerShare | null;
    direction: 'higher_better' | 'lower_better';
}

export interface OwnerReportManagerRow {
    managerId: string;
    calls: number;
    shareOfTeam: OwnerShare;
    coldAdvanced: OwnerShare;
    contactedAdvanced: OwnerShare;
    reactivationAdvanced: OwnerShare;
    needsFound: OwnerShare;
    presentationByNeeds: OwnerShare;
    closingAttempted: OwnerShare;
    nextStepDated: OwnerShare;
    objectionsHandled: OwnerShare;
    postponedWithDate: OwnerShare;
    conflict: OwnerShare;
    evasive: OwnerShare;
    advancedShareOfTeam: OwnerShare;
    upsellShareOfTeam: OwnerShare;
    /** Средняя оценка 0–100 по разобранным звонкам; null — оценок нет. */
    avgScore: number | null;
    issues: number;
    crm: OwnerReportCrmManagerFacts | null;
}

export interface OwnerReportFacts {
    period: OwnerReportPeriod;
    coverage: OwnerReportCoverage;
    outcomes: OwnerReportOutcomes;
    byTypeGroup: OwnerReportTypeGroupRow[];
    weeks: OwnerReportWeek[];
    objections: OwnerReportObjections;
    issues: OwnerReportIssues;
    prices: OwnerReportPrices;
    leaks: OwnerReportLeak[];
    management: OwnerReportManagement;
    controlMetrics: OwnerReportControlMetric[];
    managers: OwnerReportManagerRow[];
    /** Звонков без сотрудника — выводы по ним не делаются. */
    unattributedCalls: number;
}
