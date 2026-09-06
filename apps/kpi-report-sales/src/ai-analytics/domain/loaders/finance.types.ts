/**
 * Результат финансового слоя AI-аналитики (ТЗ FR-40): «финансовый хвост»
 * на менеджера — закрытые продажи по месяцам (ClosedSalesUseCase, сделки
 * sales_base в успехе по CLOSEDATE; формулы libs/shared deal-finance) и
 * живой пайплайн открытых сделок от стадии (HotClientsUseCase).
 */
import type { SalesHotThreshold } from '../../../sales-finance';
import type {
    IsoDate,
    IsoMonth,
} from '../../../shared/lib/month-segments.util';

/** Итоги закрытых продаж (ClosedSalesTotalsDto без quantity). */
export interface AiFinanceClosedTotals {
    /** Число сделок в успехе (dealsCount). */
    salesCount: number;
    /** Аванс: Σ price × qty по товарным строкам. */
    advanceAmount: number;
    /** Оплаченные месяцы: Σ qty × множитель единицы (24/12/6/3). */
    paidMonths: number;
    /** Месячный чек: Σ (сумма строки / эффективные месяцы). */
    monthlyAmount: number;
    /** monthlyAmount × месяцы договора. */
    expectedContractAmount: number;
}

export interface AiFinanceManagerMonth extends AiFinanceClosedTotals {
    managerId: number;
}

export interface AiFinanceMonth {
    month: IsoMonth;
    from: IsoDate;
    to: IsoDate;
    /** Полный календарный месяц, закончившийся до текущего (долгоживущий кэш). */
    closed: boolean;
    fromCache: boolean;
    managers: AiFinanceManagerMonth[];
    totals: AiFinanceClosedTotals;
}

/** Открытые сделки от стадии порога и выше: число и месячный чек. */
export interface AiFinancePipeline {
    count: number;
    monthlyAmount: number;
}

export interface AiFinanceManagerPipeline {
    managerId: number;
    pipelineFromStage: AiFinancePipeline;
    /** «Горячие» по стадийному определению sales-finance: открытые сделки от hotThreshold. */
    hotEvents: number;
}

export interface AiFinancePipelineResult {
    fromCache: boolean;
    managers: AiFinanceManagerPipeline[];
}

/** Сводка по менеджеру за весь период: закрытые продажи + пайплайн. */
export interface AiFinanceManagerSummary
    extends AiFinanceClosedTotals,
        Omit<AiFinanceManagerPipeline, 'managerId'> {
    managerId: number;
}

export interface AiFinanceResult {
    from: IsoDate;
    to: IsoDate;
    managerIds: number[];
    /** Порог пайплайна (стадия и выше) и порог «горячих». */
    pipelineThreshold: SalesHotThreshold;
    hotThreshold: SalesHotThreshold;
    months: AiFinanceMonth[];
    pipeline: AiFinancePipelineResult;
    managers: AiFinanceManagerSummary[];
}

export interface AiFinanceLoadOptions {
    /** Обойти чтение кэша (запись — всегда, write-through). */
    forceRefresh?: boolean;
    /** «Сейчас» для сегментации (тесты). */
    now?: Date;
    /** Порог пайплайна; по умолчанию presentation («от презентации и выше»). */
    pipelineThreshold?: SalesHotThreshold;
    /** Порог «горячих»; по умолчанию document (не ниже pipelineThreshold). */
    hotThreshold?: SalesHotThreshold;
}
