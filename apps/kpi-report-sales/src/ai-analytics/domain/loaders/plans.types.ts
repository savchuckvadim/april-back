/**
 * Планы руководителя (цель G плана, §2.2): целевые значения из Bitrix
 * user-полей UF_USR_A_SALES_PLAN_* (PlanTargetsService) и конфиг планов
 * портала (PlansConfigService: включён ли показатель, на какой период
 * задан). Не путать с планом CRM (call_plan — самоотчёт менеджера) и
 * нормой из данных.
 */
import type { PlanIndicatorCode, PlanIndicatorSetting } from '../../../plans';

export interface AiPlanManagerTargets {
    managerId: number;
    /** Ключевые цели витрины (null — план не задан). */
    sales: number | null;
    calls: number | null;
    presentations: number | null;
    /** Все показатели каталога PLAN_INDICATORS по коду. */
    targets: Record<PlanIndicatorCode, number | null>;
    /**
     * Конфиг планов портала (тот же у всех строк): строка обзора сама
     * пересчитывает план на период, как блок «Планы». Нет — конфиг не
     * прочитан (ошибка БД), и планов руководителя в строке нет.
     */
    config?: readonly PlanIndicatorSetting[];
}

export interface AiPlansResult {
    managerIds: number[];
    fromCache: boolean;
    /** false — Bitrix не ответил, планы пустые (fail-open; причина в error). */
    ok: boolean;
    error: string | null;
    /**
     * Конфиг планов портала по всему каталогу; null — не прочитан
     * (fail-open, результат не кэшируется). Нет поля — запись старого кэша.
     */
    config?: PlanIndicatorSetting[] | null;
    managers: AiPlanManagerTargets[];
}

export interface AiPlansLoadOptions {
    /** Обойти чтение кэша (запись — всегда). */
    forceRefresh?: boolean;
}
