import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../../event-report/services/context/event-report.context';
import {
    isOpenStageCode,
    TmcCloseOtherDealsService,
} from '../services/tmc-close-other-deals.service';

/**
 * Легаси `closeNoTMCDeals`: перед батчем все открытые сделки компании у
 * ответственного плана уходят в «Не состоялась» своей воронки, кроме текущей
 * ТМЦ-сделки; воронка ТМЦ чистится только при наличии текущей сделки.
 */
const CATEGORIES = [
    {
        code: 'sales_base',
        bitrixId: '97',
        stages: [
            { code: 'sales_base_cold', bitrixId: 'NEW' },
            { code: 'sales_base_warm', bitrixId: 'WARM' },
            { code: 'sales_base_success', bitrixId: 'WON' },
            { code: 'sales_base_fail', bitrixId: 'LOSE' },
            { code: 'sales_base_double', bitrixId: 'APOLOGY' },
            { code: 'sales_base_not_ca', bitrixId: 'NOT_CA' },
        ],
    },
    {
        code: 'tmc_base',
        bitrixId: '103',
        stages: [
            { code: 'sales_tmc_plan', bitrixId: 'PLAN' },
            { code: 'sales_tmc_pres_in_progress', bitrixId: 'IN_PROGRESS' },
            { code: 'sales_tmc_success', bitrixId: 'WON' },
            { code: 'sales_tmc_noresult', bitrixId: 'APOLOGY' },
        ],
    },
    {
        // Без стадии APOLOGY — её сделки не трогаются вовсе.
        code: 'sales_xo',
        bitrixId: '99',
        stages: [{ code: 'cold_new', bitrixId: 'NEW' }],
    },
];

const makeCtx = (over: Record<string, unknown> = {}): EventReportContext =>
    ({
        domain: 'gsr.bitrix24.ru',
        isDealFlow: true,
        entityType: 'company',
        entityId: 431,
        planResponsibleId: 251,
        currentBaseDeal: { ID: '500' },
        ...over,
    }) as unknown as EventReportContext;

const makeService = (
    dealsByCategory: Record<string, Array<{ ID: string }>> = {},
) => {
    const getList = jest.fn((filter: Record<string, unknown>) => {
        const stageIds = filter.STAGE_ID as string[];
        const category = String(stageIds[0]).split(':')[0].slice(1);
        return Promise.resolve({ result: dealsByCategory[category] ?? [] });
    });
    const update = jest.fn(() => Promise.resolve({ result: true }));
    const service = new TmcCloseOtherDealsService(
        { deal: { getList, update } } as unknown as BitrixService,
        { getDealCategories: () => CATEGORIES } as unknown as PortalModel,
    );
    return { service, getList, update };
};

describe('isOpenStageCode', () => {
    it('открытые — без fail/noresult/double/success и поздних финалов', () => {
        expect(isOpenStageCode('sales_base_warm')).toBe(true);
        expect(isOpenStageCode('sales_tmc_pres_in_progress')).toBe(true);
        expect(isOpenStageCode('sales_base_success')).toBe(false);
        expect(isOpenStageCode('sales_tmc_noresult')).toBe(false);
        expect(isOpenStageCode('sales_base_double')).toBe(false);
        expect(isOpenStageCode('cold_fail')).toBe(false);
        expect(isOpenStageCode('sales_base_not_ca')).toBe(false);
        expect(isOpenStageCode('pres_rejected')).toBe(false);
    });
});

describe('TmcCloseOtherDealsService', () => {
    it('ищет открытые сделки компании у ответственного по открытым стадиям и уводит их в APOLOGY своей воронки', async () => {
        const { service, getList, update } = makeService({
            97: [{ ID: '777' }],
            103: [{ ID: '888' }],
        });

        const closed = await service.apply(makeCtx());

        expect(closed).toBe(2);
        // Воронка без APOLOGY (sales_xo) не запрашивается вовсе.
        expect(getList).toHaveBeenCalledTimes(2);
        expect(getList.mock.calls[0][0]).toEqual({
            COMPANY_ID: 431,
            ASSIGNED_BY_ID: 251,
            STAGE_ID: ['C97:NEW', 'C97:WARM'],
        });
        // Своя воронка ТМЦ — без текущей сделки.
        expect(getList.mock.calls[1][0]).toEqual({
            COMPANY_ID: 431,
            ASSIGNED_BY_ID: 251,
            STAGE_ID: ['C103:PLAN', 'C103:IN_PROGRESS'],
            '!=ID': 500,
        });
        expect(update).toHaveBeenCalledWith(777, { STAGE_ID: 'C97:APOLOGY' });
        expect(update).toHaveBeenCalledWith(888, { STAGE_ID: 'C103:APOLOGY' });
    });

    it('без текущей ТМЦ-сделки воронку ТМЦ не чистит — иначе закрылась бы та, что отчёт обновит', async () => {
        const { service, getList, update } = makeService({
            103: [{ ID: '888' }],
        });

        await service.apply(makeCtx({ currentBaseDeal: null }));

        expect(getList).toHaveBeenCalledTimes(1);
        expect(getList.mock.calls[0][0]).toMatchObject({
            STAGE_ID: ['C97:NEW', 'C97:WARM'],
        });
        expect(update).not.toHaveBeenCalled();
    });

    it('текущая сделка в выдаче не закрывается; ошибка одной сделки не роняет остальные', async () => {
        const { service, update } = makeService({
            103: [{ ID: '500' }, { ID: '888' }, { ID: '889' }],
        });
        update.mockImplementationOnce(() => Promise.reject(new Error('403')));

        const closed = await service.apply(makeCtx());

        expect(update).toHaveBeenCalledTimes(2);
        expect(update).not.toHaveBeenCalledWith(500, expect.anything());
        expect(closed).toBe(1);
    });

    it('не трогает ничего без движения сделок, вне карточки компании и без ответственного', async () => {
        for (const over of [
            { isDealFlow: false },
            { entityType: 'lead' },
            { planResponsibleId: 0 },
        ]) {
            const { service, getList } = makeService({ 97: [{ ID: '1' }] });
            expect(await service.apply(makeCtx(over))).toBe(0);
            expect(getList).not.toHaveBeenCalled();
        }
    });
});
