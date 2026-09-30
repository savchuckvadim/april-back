/**
 * Результат финансового слоя AI-аналитики (ТЗ FR-40): «финансовый хвост»
 * на менеджера — закрытые продажи за период ОДНИМ вызовом ClosedSalesUseCase
 * (как вкладка «Финансы»: сделки sales_base в успехе по CLOSEDATE, формулы
 * libs/shared deal-finance) с помесячной разбивкой по дате закрытия сделок
 * и живой пайплайн открытых сделок от стадии (HotClientsUseCase) с
 * разрезами v2: «горячие» по стадии ≥ «В решении», цвет компании,
 * товарные строки, тип и срок договора (решение владельца А.2).
 */
import type { PbxDealSalesBaseStageCode } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import type {
    AiAnalyticsCompanyColorKey,
    AiAnalyticsContractTermBucket,
} from '../../constants/ai-overview.const';
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

/**
 * Месяц закрытых продаж: сделки периода, разложенные по месяцу CLOSEDATE
 * (нужен ночному шагу finance и месячному снапшоту менеджера).
 */
export interface AiFinanceMonth {
    month: IsoMonth;
    from: IsoDate;
    to: IsoDate;
    /** Полный календарный месяц, закончившийся до текущего (долгоживущий кэш). */
    closed: boolean;
    /** Месяц взят из общего кэша sales-finance — Bitrix за ним не ходили. */
    fromCache: boolean;
    managers: AiFinanceManagerMonth[];
    totals: AiFinanceClosedTotals;
}

/**
 * Откуда числа закрытых продаж: период вызова ClosedSalesUseCase (тот же,
 * что у вкладки «Финансы» за эти даты) и момент расчёта.
 */
export interface AiFinanceSource {
    /** Начало периода по дате закрытия сделки, yyyy-MM-dd. */
    from: IsoDate;
    /** Конец периода включительно, yyyy-MM-dd. */
    to: IsoDate;
    /** Момент формирования отчёта закрытых продаж, ISO. */
    generatedAt: string;
}

/** Открытые сделки от стадии порога и выше: число и месячный чек. */
export interface AiFinancePipeline {
    count: number;
    monthlyAmount: number;
}

/** Число «горячих» сделок по цвету компании; none — цвет не задан. */
export type AiFinanceHotByColor = Record<AiAnalyticsCompanyColorKey, number>;

/** Пайплайн от стадии по типу договора сделки (contract_type). */
export interface AiFinancePipelineByContractType {
    /** Код типа договора (XML_ID / bx_<ID>); null — тип не задан. */
    code: string | null;
    /** Название типа договора из живого словаря; null — тип не задан. */
    name: string | null;
    count: number;
    monthlyAmount: number;
    /** Аванс: Σ productRowsAmount (Σ price × qty товарных строк). */
    advanceAmount: number;
}

/** Пайплайн от стадии по бакету срока договора (contract_start/contract_end). */
export interface AiFinancePipelineByTerm {
    bucket: AiAnalyticsContractTermBucket;
    count: number;
    monthlyAmount: number;
    /** Σ round2(monthlyAmount × месяцы договора); null для бакета none. */
    expectedContractAmount: number | null;
}

/**
 * Пайплайн менеджера: открытые сделки от порога пайплайна, «горячие»
 * (стадия ≥ AI_ANALYTICS_HOT_STAGE_CODE) и разрезы v2.
 */
export interface AiFinancePipelineFacts {
    pipelineFromStage: AiFinancePipeline;
    /** «Горячие»: открытые сделки со стадией не ниже «В решении». */
    hotEvents: number;
    /** «Горячие» по цвету компании (UF op_prospects). */
    hotByColor: AiFinanceHotByColor;
    /** «Горячие» с товарными строками (productRowsAmount > 0 — «с предложением»). */
    withOfferCount: number;
    /** Весь пайплайн от стадии по типу договора, порядок — по code (null последним). */
    pipelineByContractType: AiFinancePipelineByContractType[];
    /** Весь пайплайн от стадии по сроку договора, порядок — по AI_ANALYTICS_CONTRACT_TERM_BUCKETS. */
    pipelineByTerm: AiFinancePipelineByTerm[];
}

export interface AiFinanceManagerPipeline extends AiFinancePipelineFacts {
    managerId: number;
}

export interface AiFinancePipelineResult {
    fromCache: boolean;
    managers: AiFinanceManagerPipeline[];
}

/**
 * Сводка по менеджеру за весь период: закрытые продажи (итоги сотрудника
 * из отчёта ClosedSalesUseCase — те же числа, что на вкладке «Финансы»)
 * + пайплайн.
 */
export interface AiFinanceManagerSummary
    extends AiFinanceClosedTotals,
        AiFinancePipelineFacts {
    managerId: number;
    /** Откуда числа закрытых продаж; нет — сводка собрана без отчёта. */
    source?: AiFinanceSource;
}

export interface AiFinanceResult {
    from: IsoDate;
    to: IsoDate;
    managerIds: number[];
    /** Порог пайплайна (стадия и выше, sales-finance). */
    pipelineThreshold: SalesHotThreshold;
    /** Стадия «горячих» (включительно) по лестнице sales_base. */
    hotStageCode: PbxDealSalesBaseStageCode;
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
    /** Стадия «горячих»; по умолчанию AI_ANALYTICS_HOT_STAGE_CODE («В решении»). */
    hotStageCode?: PbxDealSalesBaseStageCode;
}
