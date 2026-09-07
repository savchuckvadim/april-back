import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    AI_ANALYTICS_CONTRACT_TERM_BUCKETS,
    AI_ANALYTICS_HOT_STAGE_CODE,
} from '../constants/ai-overview.const';
import { toFinanceTail } from '../domain/assembler/manager-facts.assembler';
import {
    companyColorKeyOf,
    contractMonthsOf,
    contractTermBucketOf,
    emptyManagerPipeline,
    groupByContractType,
    groupByTerm,
    stageOrderOf,
    toPipelineByManager,
} from '../domain/loaders/finance-pipeline.assembler';
import { summarizeManagers } from '../domain/loaders/finance.assembler';
import { hotDeal, hotDealsFixture } from './fixtures/hot-clients.fixture';

describe('finance-pipeline.assembler', () => {
    it('порог «горячего» — стадия «В решении» (решение владельца А.2)', () => {
        expect(AI_ANALYTICS_HOT_STAGE_CODE).toBe(
            PBX_DEAL_SALES_BASE_STAGE_CODE.inProgress,
        );
        expect(stageOrderOf('sales_refine')).toBeLessThan(
            stageOrderOf(AI_ANALYTICS_HOT_STAGE_CODE),
        );
        expect(stageOrderOf('C7:UNKNOWN')).toBe(0);
    });

    it('hotEvents: refine/document_send — не горячие, in_progress и выше — горячие', () => {
        const [row] = toPipelineByManager(
            [
                hotDeal(1, 'sales_refine', 10),
                hotDeal(1, 'sales_document_send', 10),
                hotDeal(1, 'sales_in_progress', 10),
                hotDeal(1, 'sales_supply', 10),
            ],
            [1],
        );
        expect(row.pipelineFromStage.count).toBe(4);
        expect(row.hotEvents).toBe(2);
    });

    it('фикстура: пайплайн, горячие по цвету, «с предложением», сделки вне ростера отброшены', () => {
        const rows = toPipelineByManager(hotDealsFixture(), [1, 2]);
        expect(rows.map(row => row.managerId)).toEqual([1, 2]);
        const [manager1, manager2] = rows;

        expect(manager1.pipelineFromStage).toEqual({
            count: 6,
            monthlyAmount: 122000,
        });
        expect(manager1.hotEvents).toBe(3);
        expect(manager1.hotByColor).toEqual({
            green: 1,
            yellow: 0,
            red: 1,
            none: 1,
        });
        expect(manager1.withOfferCount).toBe(2);
        expect(manager2).toEqual(emptyManagerPipeline(2));
    });

    it('pipelineByContractType: суммы по типу, порядок по code, null — последним', () => {
        const [row] = toPipelineByManager(hotDealsFixture(), [1]);
        expect(row.pipelineByContractType).toEqual([
            {
                code: 'garant_internet',
                name: 'Интернет-версия',
                count: 2,
                monthlyAmount: 72000,
                advanceAmount: 504000,
            },
            {
                code: 'garant_standart',
                name: 'Стандарт',
                count: 3,
                monthlyAmount: 35000,
                advanceAmount: 120000,
            },
            {
                code: null,
                name: null,
                count: 1,
                monthlyAmount: 15000,
                advanceAmount: 45000,
            },
        ]);
    });

    it('pipelineByTerm: бакеты в порядке справочника, expectedContractAmount = Σ чек × месяцы', () => {
        const [row] = toPipelineByManager(hotDealsFixture(), [1]);
        expect(row.pipelineByTerm).toEqual([
            {
                bucket: '3',
                count: 1,
                monthlyAmount: 30000,
                expectedContractAmount: 90000,
            },
            {
                bucket: '6',
                count: 1,
                monthlyAmount: 20000,
                expectedContractAmount: 120000,
            },
            {
                bucket: '12',
                count: 2,
                monthlyAmount: 52000,
                expectedContractAmount: 624000,
            },
            {
                bucket: '24',
                count: 1,
                monthlyAmount: 5000,
                expectedContractAmount: 180000,
            },
            {
                bucket: 'none',
                count: 1,
                monthlyAmount: 15000,
                expectedContractAmount: null,
            },
        ]);
        expect(row.pipelineByTerm.map(group => group.bucket)).toEqual(
            AI_ANALYTICS_CONTRACT_TERM_BUCKETS,
        );
    });

    it('42 000 × 12 месяцев = 504 000; без дат — none и null', () => {
        const twelveMonths = hotDealsFixture()[3];
        expect(contractMonthsOf(twelveMonths)).toBe(12);
        expect(groupByTerm([twelveMonths])).toEqual([
            {
                bucket: '12',
                count: 1,
                monthlyAmount: 42000,
                expectedContractAmount: 504000,
            },
        ]);
        expect(contractMonthsOf(hotDeal(1, 'sales_pres', 1))).toBeNull();
        expect(groupByTerm([hotDeal(1, 'sales_pres', 100)])).toEqual([
            {
                bucket: 'none',
                count: 1,
                monthlyAmount: 100,
                expectedContractAmount: null,
            },
        ]);
    });

    it('contractTermBucketOf: границы бакетов включительно, дольше 12 — 24', () => {
        expect(contractTermBucketOf(null)).toBe('none');
        expect(contractTermBucketOf(0)).toBe('3');
        expect(contractTermBucketOf(3)).toBe('3');
        expect(contractTermBucketOf(4)).toBe('6');
        expect(contractTermBucketOf(6)).toBe('6');
        expect(contractTermBucketOf(7)).toBe('12');
        expect(contractTermBucketOf(12)).toBe('12');
        expect(contractTermBucketOf(13)).toBe('24');
        expect(contractTermBucketOf(24)).toBe('24');
        expect(contractTermBucketOf(36)).toBe('24');
    });

    it('companyColorKeyOf: цвета справочника, null и чужое значение → none', () => {
        expect(companyColorKeyOf('green')).toBe('green');
        expect(companyColorKeyOf('yellow')).toBe('yellow');
        expect(companyColorKeyOf('red')).toBe('red');
        expect(companyColorKeyOf(null)).toBe('none');
        expect(companyColorKeyOf('blue')).toBe('none');
    });

    it('деньги округляются до копеек при суммировании', () => {
        const [row] = toPipelineByManager(
            [
                hotDeal(1, 'sales_pres', 10, { contractTypeCode: 'a' }),
                hotDeal(1, 'sales_pres', 10, { contractTypeCode: 'a' }),
                hotDeal(1, 'sales_pres', 10, { contractTypeCode: 'a' }),
                hotDeal(1, 'sales_pres', 10.005, { contractTypeCode: 'a' }),
            ],
            [1],
        );
        expect(row.pipelineFromStage.monthlyAmount).toBe(40.01);
        expect(groupByContractType([])).toEqual([]);
        expect(row.pipelineByContractType[0].monthlyAmount).toBe(40.01);
    });

    it('пустой отчёт — строка ростера с нулями и пустыми разрезами', () => {
        expect(toPipelineByManager([], [7])).toEqual([
            {
                managerId: 7,
                pipelineFromStage: { count: 0, monthlyAmount: 0 },
                hotEvents: 0,
                hotByColor: { green: 0, yellow: 0, red: 0, none: 0 },
                withOfferCount: 0,
                pipelineByContractType: [],
                pipelineByTerm: [],
            },
        ]);
    });

    it('toFinanceTail: прокидывает разрезы v2 из сводки, без сводки — нули', () => {
        const [pipeline] = toPipelineByManager(hotDealsFixture(), [1]);
        const [summary] = summarizeManagers([], [pipeline], [1]);
        const tail = toFinanceTail(summary);
        expect(tail.hotEvents).toBe(3);
        expect(tail.hotByColor).toEqual(pipeline.hotByColor);
        expect(tail.withOfferCount).toBe(2);
        expect(tail.pipelineByContractType).toEqual(
            pipeline.pipelineByContractType,
        );
        expect(tail.pipelineByContractType).not.toBe(
            pipeline.pipelineByContractType,
        );
        expect(tail.pipelineByTerm).toEqual(pipeline.pipelineByTerm);
        expect(tail.salesCount).toBe(0);

        expect(toFinanceTail(undefined)).toEqual({
            salesCount: 0,
            advanceAmount: 0,
            monthlyAmount: 0,
            pipelineFromStage: { count: 0, monthlyAmount: 0 },
            hotEvents: 0,
            hotByColor: { green: 0, yellow: 0, red: 0, none: 0 },
            withOfferCount: 0,
            pipelineByContractType: [],
            pipelineByTerm: [],
        });
    });
});
