/**
 * Планы руководителя (цель G плана, §2.2): целевые значения из Bitrix
 * user-полей UF_USR_A_SALES_PLAN_* (PlanTargetsService), не путать с
 * планом CRM (call_plan) и нормой из данных.
 */
import type { PlanIndicatorCode } from '../../../plans';

export interface AiPlanManagerTargets {
    managerId: number;
    /** Ключевые цели витрины (null — план не задан). */
    sales: number | null;
    calls: number | null;
    presentations: number | null;
    /** Все показатели каталога PLAN_INDICATORS по коду. */
    targets: Record<PlanIndicatorCode, number | null>;
}

export interface AiPlansResult {
    managerIds: number[];
    fromCache: boolean;
    /** false — Bitrix не ответил, планы пустые (fail-open; причина в error). */
    ok: boolean;
    error: string | null;
    managers: AiPlanManagerTargets[];
}

export interface AiPlansLoadOptions {
    /** Обойти чтение кэша (запись — всегда). */
    forceRefresh?: boolean;
}
