/**
 * Чистая сборка пайплайна AI-аналитики из списка открытых сделок
 * HotClientsReportDto.deals — один вызов HotClientsUseCase по порогу
 * пайплайна (тот же, что у вкладки «Финансы»). На менеджера ростера:
 * пайплайн от стадии, «горячие» (стадия ≥ AI_ANALYTICS_HOT_STAGE_CODE —
 * решение владельца А.2), разрезы горячих по цвету компании и наличию
 * товарных строк, пайплайн по типу и сроку договора (v2).
 */
import {
    getSalesBaseStageOrder,
    PBX_DEAL_SALES_BASE_STAGES,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    countContractMonths,
    parseContractDate,
} from '@lib/shared/lib/date/contract-months';
import { roundMoney } from '@lib/shared/lib/deal-finance';
import {
    AI_ANALYTICS_COMPANY_COLOR_KEYS,
    AI_ANALYTICS_COMPANY_COLOR_NONE,
    AI_ANALYTICS_COMPANY_COLORS,
    AI_ANALYTICS_CONTRACT_TERM_BUCKET,
    AI_ANALYTICS_CONTRACT_TERM_BUCKETS,
    AI_ANALYTICS_HOT_STAGE_CODE,
    AiAnalyticsCompanyColor,
    AiAnalyticsCompanyColorKey,
    AiAnalyticsContractTermBucket,
} from '../../constants/ai-overview.const';
import { HotClientDealDto } from '../../../sales-finance';
import type {
    AiFinanceHotByColor,
    AiFinanceManagerPipeline,
    AiFinancePipeline,
    AiFinancePipelineByContractType,
    AiFinancePipelineByTerm,
    AiFinancePipelineFacts,
} from './finance.types';

/** Поля сделки, нужные для разрезов (остальное HotClientDealDto не читается). */
export type PipelineDeal = Pick<
    HotClientDealDto,
    | 'assignedId'
    | 'stageCode'
    | 'monthlyAmount'
    | 'productRowsAmount'
    | 'companyColor'
    | 'contractTypeCode'
    | 'contractTypeName'
    | 'contractStart'
    | 'contractEnd'
>;

/** Порядок стадии лестницы sales_base по коду стадии портала; неизвестная → 0. */
export function stageOrderOf(stageCode: string): number {
    return (
        PBX_DEAL_SALES_BASE_STAGES.find(stage => stage.code === stageCode)
            ?.order ?? 0
    );
}

export function emptyHotByColor(): AiFinanceHotByColor {
    const counters = {} as AiFinanceHotByColor;
    for (const key of AI_ANALYTICS_COMPANY_COLOR_KEYS) counters[key] = 0;
    return counters;
}

export function emptyPipelineFacts(): AiFinancePipelineFacts {
    return {
        pipelineFromStage: { count: 0, monthlyAmount: 0 },
        hotEvents: 0,
        hotByColor: emptyHotByColor(),
        withOfferCount: 0,
        pipelineByContractType: [],
        pipelineByTerm: [],
    };
}

export function emptyManagerPipeline(
    managerId: number,
): AiFinanceManagerPipeline {
    return { managerId, ...emptyPipelineFacts() };
}

function isCompanyColor(value: string): value is AiAnalyticsCompanyColor {
    return (AI_ANALYTICS_COMPANY_COLORS as readonly string[]).includes(value);
}

/** Ключ разреза по цвету компании: цвет справочника либо none. */
export function companyColorKeyOf(
    color: string | null,
): AiAnalyticsCompanyColorKey {
    return color !== null && isCompanyColor(color)
        ? color
        : AI_ANALYTICS_COMPANY_COLOR_NONE;
}

/** Месяцы договора по датам сделки (countContractMonths); null — даты не заполнены. */
export function contractMonthsOf(
    deal: Pick<PipelineDeal, 'contractStart' | 'contractEnd'>,
): number | null {
    const start = parseContractDate(deal.contractStart);
    const end = parseContractDate(deal.contractEnd);
    return start && end ? countContractMonths(start, end) : null;
}

/** Бакет срока: первый бакет с границей ≥ месяцев, дольше 12 — longest, без дат — none. */
export function contractTermBucketOf(
    months: number | null,
): AiAnalyticsContractTermBucket {
    if (months === null) return AI_ANALYTICS_CONTRACT_TERM_BUCKET.none;
    for (const bucket of AI_ANALYTICS_CONTRACT_TERM_BUCKETS) {
        if (bucket === AI_ANALYTICS_CONTRACT_TERM_BUCKET.none) continue;
        if (months <= Number(bucket)) return bucket;
    }
    return AI_ANALYTICS_CONTRACT_TERM_BUCKET.longest;
}

/** «С предложением»: у сделки есть товарные строки. */
export const hasOffer = (deal: Pick<PipelineDeal, 'productRowsAmount'>) =>
    deal.productRowsAmount > 0;

function sumPipeline(deals: readonly PipelineDeal[]): AiFinancePipeline {
    return {
        count: deals.length,
        monthlyAmount: roundMoney(
            deals.reduce((sum, deal) => sum + deal.monthlyAmount, 0),
        ),
    };
}

export function countHotByColor(
    hotDeals: readonly PipelineDeal[],
): AiFinanceHotByColor {
    const counters = emptyHotByColor();
    for (const deal of hotDeals) {
        counters[companyColorKeyOf(deal.companyColor)] += 1;
    }
    return counters;
}

/** Сравнение кодов типа договора: по строке, null — последним. */
function compareContractTypeCodes(a: string | null, b: string | null): number {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a.localeCompare(b);
}

/** Группы по типу договора (только непустые), отсортированы по code. */
export function groupByContractType(
    deals: readonly PipelineDeal[],
): AiFinancePipelineByContractType[] {
    const groups = new Map<string | null, AiFinancePipelineByContractType>();
    for (const deal of deals) {
        const group = groups.get(deal.contractTypeCode) ?? {
            code: deal.contractTypeCode,
            name: deal.contractTypeName,
            count: 0,
            monthlyAmount: 0,
            advanceAmount: 0,
        };
        group.count += 1;
        group.monthlyAmount = roundMoney(
            group.monthlyAmount + deal.monthlyAmount,
        );
        group.advanceAmount = roundMoney(
            group.advanceAmount + deal.productRowsAmount,
        );
        groups.set(deal.contractTypeCode, group);
    }
    return [...groups.values()].sort((a, b) =>
        compareContractTypeCodes(a.code, b.code),
    );
}

/** Группы по бакету срока (только непустые) в порядке AI_ANALYTICS_CONTRACT_TERM_BUCKETS. */
export function groupByTerm(
    deals: readonly PipelineDeal[],
): AiFinancePipelineByTerm[] {
    const groups = new Map<
        AiAnalyticsContractTermBucket,
        AiFinancePipelineByTerm
    >();
    for (const deal of deals) {
        const months = contractMonthsOf(deal);
        const bucket = contractTermBucketOf(months);
        const group = groups.get(bucket) ?? {
            bucket,
            count: 0,
            monthlyAmount: 0,
            expectedContractAmount: months === null ? null : 0,
        };
        group.count += 1;
        group.monthlyAmount = roundMoney(
            group.monthlyAmount + deal.monthlyAmount,
        );
        if (months !== null && group.expectedContractAmount !== null) {
            group.expectedContractAmount = roundMoney(
                group.expectedContractAmount +
                    roundMoney(deal.monthlyAmount * months),
            );
        }
        groups.set(bucket, group);
    }
    return AI_ANALYTICS_CONTRACT_TERM_BUCKETS.flatMap(bucket => {
        const group = groups.get(bucket);
        return group ? [group] : [];
    });
}

/**
 * Пайплайн менеджера по его сделкам: разрезы по типу/сроку — по всему
 * пайплайну, цвет и «с предложением» — только по горячим.
 */
export function toPipelineFacts(
    deals: readonly PipelineDeal[],
    hotOrder: number,
): AiFinancePipelineFacts {
    const hot = deals.filter(deal => stageOrderOf(deal.stageCode) >= hotOrder);
    return {
        pipelineFromStage: sumPipeline(deals),
        hotEvents: hot.length,
        hotByColor: countHotByColor(hot),
        withOfferCount: hot.filter(hasOffer).length,
        pipelineByContractType: groupByContractType(deals),
        pipelineByTerm: groupByTerm(deals),
    };
}

/**
 * Пайплайн по менеджерам ростера (строка на каждого, нули без сделок;
 * сделки вне ростера отбрасываются). «Горячие» — стадия ≥ hotStageCode.
 */
export function toPipelineByManager(
    deals: readonly PipelineDeal[],
    managerIds: readonly number[],
    hotStageCode: PbxDealSalesBaseStageCode = AI_ANALYTICS_HOT_STAGE_CODE,
): AiFinanceManagerPipeline[] {
    const hotOrder = getSalesBaseStageOrder(hotStageCode);
    const dealsByManager = new Map<number, PipelineDeal[]>(
        managerIds.map(managerId => [managerId, []]),
    );
    for (const deal of deals) {
        dealsByManager.get(deal.assignedId)?.push(deal);
    }
    return [...dealsByManager.entries()].map(([managerId, own]) => ({
        managerId,
        ...toPipelineFacts(own, hotOrder),
    }));
}
