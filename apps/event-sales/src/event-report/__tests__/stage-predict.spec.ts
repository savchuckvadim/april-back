import { StagePredictService } from '../services/stage-predict/stage-predict.service';
import { PBXService } from '@/modules/pbx';
import { StagePredictRequestDto } from '../dto/stage-predict/stage-predict.dto';
import {
    EnumEventItemResultType,
    EnumWorkStatusCode,
} from '../../event-report/types/report-types';

/**
 * Предикт стадии: та же лестница, что у реального flow
 * (getSalesBaseTargetStageCode) + тот же приоритет сделки плейсмента.
 */
const CATEGORY = {
    code: 'sales_base',
    bitrixId: 1,
    stages: [
        { code: 'sales_cold', bitrixId: 'NEW' },
        { code: 'sales_warm', bitrixId: 'WARM' },
        { code: 'sales_pres', bitrixId: 'PRES' },
        { code: 'sales_in_progress', bitrixId: 'IN_PROGRESS' },
        { code: 'sales_success', bitrixId: 'WON' },
        { code: 'sales_fail', bitrixId: 'LOSE' },
        { code: 'sales_not_ca', bitrixId: 'NOT_CA' },
    ],
};

const makeService = (over?: {
    deals?: Array<Record<string, unknown>>;
    dealById?: Record<string, Record<string, unknown>>;
}): StagePredictService => {
    const pbx = {
        init: () =>
            Promise.resolve({
                bitrix: {
                    deal: {
                        get: (id: number) =>
                            Promise.resolve({
                                result: over?.dealById?.[String(id)] ?? null,
                            }),
                        getList: () =>
                            Promise.resolve({ result: over?.deals ?? [] }),
                    },
                },
                PortalModel: {
                    getDealCategoryByCode: (code: string) =>
                        code === 'sales_base' ? CATEGORY : undefined,
                },
            }),
    } as unknown as PBXService;
    return new StagePredictService(pbx);
};

const request = (
    over?: Partial<StagePredictRequestDto>,
): StagePredictRequestDto =>
    ({
        domain: 'x.bitrix24.ru',
        context: { companyId: 431 },
        workStatusCode: EnumWorkStatusCode.inJob,
        ...over,
    }) as StagePredictRequestDto;

describe('StagePredictService', () => {
    it('план «Решение» со стадии презентации → sales_in_progress, willChange', async () => {
        const service = makeService({
            deals: [{ ID: '100', STAGE_ID: 'C1:PRES', CATEGORY_ID: '1' }],
        });
        const result = await service.predict(
            request({
                planEventType: 'hot',
                resultStatus: EnumEventItemResultType.RESULT,
            }),
        );
        expect(result.baseDealId).toBe(100);
        expect(result.currentStageCode).toBe('sales_pres');
        expect(result.targetStageCode).toBe('sales_in_progress');
        expect(result.targetStageBitrixId).toBe('C1:IN_PROGRESS');
        expect(result.willChange).toBe(true);
    });

    it('продажа → sales_success; не ЦА → sales_not_ca (fail + isNotCa)', async () => {
        const service = makeService({
            deals: [{ ID: '100', STAGE_ID: 'C1:PRES', CATEGORY_ID: '1' }],
        });
        const success = await service.predict(
            request({
                workStatusCode: EnumWorkStatusCode.success,
                resultStatus: EnumEventItemResultType.RESULT,
            }),
        );
        expect(success.targetStageCode).toBe('sales_success');

        const notCa = await service.predict(
            request({
                workStatusCode: EnumWorkStatusCode.fail,
                resultStatus: EnumEventItemResultType.RESULT,
                isNotCa: true,
            }),
        );
        expect(notCa.targetStageCode).toBe('sales_not_ca');
    });

    it('сделка плейсмента в приоритете над первой по списку', async () => {
        const service = makeService({
            deals: [
                { ID: '100', STAGE_ID: 'C1:WARM', CATEGORY_ID: '1' },
                { ID: '250', STAGE_ID: 'C1:PRES', CATEGORY_ID: '1' },
            ],
        });
        const result = await service.predict(
            request({
                context: { companyId: 431, dealId: 250 },
                planEventType: 'hot',
                resultStatus: EnumEventItemResultType.RESULT,
            }),
        );
        expect(result.baseDealId).toBe(250);
        expect(result.currentStageCode).toBe('sales_pres');
    });

    it('lead-only контекст → предикта нет (сделки не двигаются)', async () => {
        const result = await makeService().predict(
            request({ context: { leadId: 7 } }),
        );
        expect(result.targetStageCode).toBeNull();
        expect(result.willChange).toBe(false);
    });

    it('стадия не меняется → willChange=false', async () => {
        const service = makeService({
            deals: [
                { ID: '100', STAGE_ID: 'C1:IN_PROGRESS', CATEGORY_ID: '1' },
            ],
        });
        const result = await service.predict(
            request({
                planEventType: 'hot',
                resultStatus: EnumEventItemResultType.RESULT,
            }),
        );
        expect(result.targetStageCode).toBe('sales_in_progress');
        expect(result.willChange).toBe(false);
    });

    /**
     * Правило владельца (25.08), зеркально init: с переданным
     * context.responsibleId автоподбор — только среди сделок этого
     * сотрудника; чужая открытая не подхватывается (сравнение числом).
     */
    it('своя сделка предпочитается более ранней чужой (responsibleId)', async () => {
        const service = makeService({
            deals: [
                {
                    ID: '100',
                    STAGE_ID: 'C1:WARM',
                    CATEGORY_ID: '1',
                    ASSIGNED_BY_ID: '3',
                },
                {
                    ID: '250',
                    STAGE_ID: 'C1:PRES',
                    CATEGORY_ID: '1',
                    ASSIGNED_BY_ID: '8',
                },
            ],
        });
        const result = await service.predict(
            request({
                context: { companyId: 431, responsibleId: 8 },
                planEventType: 'hot',
                resultStatus: EnumEventItemResultType.RESULT,
            }),
        );
        expect(result.baseDealId).toBe(250);
        expect(result.currentStageCode).toBe('sales_pres');
    });

    it('только чужие открытые — базовой нет (flow создаст новую)', async () => {
        const service = makeService({
            deals: [
                {
                    ID: '100',
                    STAGE_ID: 'C1:WARM',
                    CATEGORY_ID: '1',
                    ASSIGNED_BY_ID: '3',
                },
            ],
        });
        const result = await service.predict(
            request({
                context: { companyId: 431, responsibleId: 8 },
                planEventType: 'hot',
                resultStatus: EnumEventItemResultType.RESULT,
            }),
        );
        expect(result.baseDealId).toBeNull();
        expect(result.currentStageCode).toBeNull();
        // Отправка создаст сделку в целевой стадии — willChange честный.
        expect(result.willChange).toBe(true);
    });

    it('сделка плейсмента вне правила: явный контекст, даже чужая', async () => {
        const service = makeService({
            deals: [
                {
                    ID: '100',
                    STAGE_ID: 'C1:WARM',
                    CATEGORY_ID: '1',
                    ASSIGNED_BY_ID: '8',
                },
                {
                    ID: '250',
                    STAGE_ID: 'C1:PRES',
                    CATEGORY_ID: '1',
                    ASSIGNED_BY_ID: '3',
                },
            ],
        });
        const result = await service.predict(
            request({
                context: { companyId: 431, dealId: 250, responsibleId: 8 },
                planEventType: 'hot',
                resultStatus: EnumEventItemResultType.RESULT,
            }),
        );
        expect(result.baseDealId).toBe(250);
    });

    it('сделка без компании: берётся её COMPANY_ID, плейсмент в приоритете', async () => {
        const service = makeService({
            dealById: {
                '250': {
                    ID: '250',
                    STAGE_ID: 'C1:PRES',
                    CATEGORY_ID: '1',
                    COMPANY_ID: '431',
                },
            },
            deals: [
                { ID: '100', STAGE_ID: 'C1:WARM', CATEGORY_ID: '1' },
                { ID: '250', STAGE_ID: 'C1:PRES', CATEGORY_ID: '1' },
            ],
        });
        const result = await service.predict(
            request({
                context: { dealId: 250 },
                workStatusCode: EnumWorkStatusCode.fail,
                resultStatus: EnumEventItemResultType.RESULT,
            }),
        );
        expect(result.baseDealId).toBe(250);
        expect(result.targetStageCode).toBe('sales_fail');
    });
});
