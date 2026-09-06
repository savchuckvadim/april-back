/**
 * Ключи и TTL кэша loader'ов KPI-слоя (Фаза 1b плана
 * ai/tasks/ai-sales-analytics-plan.md, раздел 9, п. 1). Префикс — общий
 * для модуля (AI_ANALYTICS_CACHE_PREFIX), секции — свои:
 *
 *   sales-ai-analytics:v1:{domain}:kpi-month:{yyyy-MM}:{usersKey}            — полный закрытый месяц KPI
 *   sales-ai-analytics:v1:{domain}:kpi-month:{yyyy-MM}:{usersKey}:{from}_{to} — живой/неполный сегмент
 *   sales-ai-analytics:v1:{domain}:finance-month:{yyyy-MM}:{usersKey}[…]     — финансы по той же схеме
 *   sales-ai-analytics:v1:{domain}:finance-pipeline:{threshold}:{usersKey}   — открытый пайплайн
 *   sales-ai-analytics:v1:{domain}:plans:{usersKey}                          — планы руководителя
 *   sales-ai-analytics:v1:{domain}:managers                                  — ростер ОП
 *
 * Неполный сегмент (часть месяца или текущий месяц) обязан нести границы
 * дней в ключе: иначе частичный расчёт за «15–31 августа» лёг бы под ключ
 * полного августа и следующий запрос получил бы урезанные счётчики.
 * Сброс `cache/reset {scope: 'all'}` покрывает все секции паттерном домена.
 */
import { AI_ANALYTICS_CACHE_PREFIX } from '../../constants/ai-analytics.const';
import type { MonthSegment } from '../../../shared/lib/month-segments.util';

export const AI_ANALYTICS_LOADER_CACHE_SECTIONS = {
    KPI_MONTH: 'kpi-month',
    FINANCE_MONTH: 'finance-month',
    FINANCE_PIPELINE: 'finance-pipeline',
    PLANS: 'plans',
    MANAGERS: 'managers',
} as const;

/** Полный закрытый месяц: данные закрыты, живут долго (как sales-finance). */
export const AI_ANALYTICS_CLOSED_MONTH_TTL_SECONDS = 60 * 60 * 24 * 30;
/** Текущий/неполный сегмент и живой пайплайн: короткий буфер. */
export const AI_ANALYTICS_LIVE_TTL_SECONDS = 180;
/** Планы руководителя (UF-поля меняются редко). */
export const AI_ANALYTICS_PLANS_TTL_SECONDS = 60 * 60;
/** Ростер менеджеров ОП по структуре отделов. */
export const AI_ANALYTICS_MANAGERS_TTL_SECONDS = 300;

const { KPI_MONTH, FINANCE_MONTH, FINANCE_PIPELINE, PLANS, MANAGERS } =
    AI_ANALYTICS_LOADER_CACHE_SECTIONS;

function monthSegmentKey(
    domain: string,
    section: string,
    segment: MonthSegment,
    usersKey: string,
): string {
    const base = `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${section}:${segment.month}:${usersKey}`;
    return segment.cacheable ? base : `${base}:${segment.from}_${segment.to}`;
}

export function buildKpiMonthKey(
    domain: string,
    segment: MonthSegment,
    usersKey: string,
): string {
    return monthSegmentKey(domain, KPI_MONTH, segment, usersKey);
}

export function buildFinanceMonthKey(
    domain: string,
    segment: MonthSegment,
    usersKey: string,
): string {
    return monthSegmentKey(domain, FINANCE_MONTH, segment, usersKey);
}

export function buildFinancePipelineKey(
    domain: string,
    threshold: string,
    usersKey: string,
): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${FINANCE_PIPELINE}:${threshold}:${usersKey}`;
}

export function buildPlansKey(domain: string, usersKey: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${PLANS}:${usersKey}`;
}

export function buildManagersKey(domain: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${MANAGERS}`;
}

/** TTL сегмента: закрытый полный месяц — 30 дней, иначе живой буфер. */
export function monthSegmentTtlSeconds(segment: MonthSegment): number {
    return segment.cacheable
        ? AI_ANALYTICS_CLOSED_MONTH_TTL_SECONDS
        : AI_ANALYTICS_LIVE_TTL_SECONDS;
}
