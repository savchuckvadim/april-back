import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../../event-report/services/context/event-report.context';
import {
    SET_TMC_DEAL_CMD,
    TmcBaseDealService,
} from '../services/tmc-base-deal.service';

/**
 * Сделка «ТМЦ Основная» в режиме ТМЦ: стадия по лестнице ТМЦ, ответственный
 * — ответственный плана, новая сделка создаётся на компанию и отдаётся
 * остальным командам подстановкой батча (зеркало легаси tmc_base).
 */
const NOW = new Date('2026-11-02T09:00:00.000Z');

const TMC_CATEGORY = {
    code: 'tmc_base',
    bitrixId: '103',
    stages: [
        { code: 'sales_tmc_new', bitrixId: 'NEW' },
        { code: 'sales_tmc_plan', bitrixId: 'PLAN' },
        { code: 'sales_tmc_pending', bitrixId: 'PENDING' },
        { code: 'sales_tmc_pres_in_progress', bitrixId: 'IN_PROGRESS' },
        { code: 'sales_tmc_pres_plan', bitrixId: 'PRES_PLAN' },
        { code: 'sales_tmc_success', bitrixId: 'WON' },
        { code: 'sales_tmc_fail', bitrixId: 'LOSE' },
        { code: 'sales_tmc_noresult', bitrixId: 'APOLOGY' },
    ],
};

const makePortal = (withCategory = true) =>
    ({
        getTimezone: () => 'Europe/Moscow',
        getPortal: () => ({ domain: 'gsr.bitrix24.ru' }),
        getDealCategoryByCode: (code: string) =>
            withCategory && code === 'tmc_base' ? TMC_CATEGORY : undefined,
        getEntityFieldByCode: () => undefined,
        getFieldItemByCode: () => undefined,
    }) as unknown as PortalModel;

const makeCtx = (
    dto: Record<string, unknown> = {},
    init: Record<string, unknown> = {},
): EventReportContext =>
    new EventReportContext(
        {
            domain: 'gsr.bitrix24.ru',
            departament: { mode: { id: 2, code: 'tmc', name: 'ТМЦ' } },
            report: {
                resultStatus: 'result',
                description: 'Поговорили',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: {
                isPlanned: true,
                isActive: true,
                type: { current: { code: 'warm', name: 'Звонок' } },
                name: 'Перезвонить',
                deadline: '2026-11-05T12:00:00',
                responsibility: { ID: 251 },
                createdBy: { ID: 7 },
                contact: { ID: 9 },
            },
            ...dto,
        } as never,
        makePortal() as never,
        {
            entityType: 'company',
            entityId: 431,
            company: { ID: '431', TITLE: 'ООО «Ромашка»' },
            lead: null,
            currentBaseDeal: null,
            currentXoDeal: null,
            currentPresDeal: null,
            currentTmcDeal: null,
            reportContact: null,
            planContact: { ID: '9' },
            ...init,
        } as never,
        NOW,
    );

const makeService = (portal: PortalModel = makePortal()) => {
    const update = jest.fn<void, [string, number, Record<string, unknown>]>();
    const set = jest.fn<void, [string, Record<string, unknown>]>();
    const service = new TmcBaseDealService(
        { batch: { deal: { update, set } } } as unknown as BitrixService,
        portal,
    );
    return { service, update, set };
};

describe('TmcBaseDealService', () => {
    it('нет открытой ТМЦ-сделки — создаёт на компанию и отдаёт подстановку батча', () => {
        const { service, set, update } = makeService();

        const result = service.queue(makeCtx());

        expect(result.baseDealId).toBe(`$result[${SET_TMC_DEAL_CMD}]`);
        expect(result.newPlanPresDealId).toBeNull();
        expect(update).not.toHaveBeenCalled();
        expect(set).toHaveBeenCalledTimes(1);
        const [cmd, fields] = set.mock.calls[0];
        expect(cmd).toBe(SET_TMC_DEAL_CMD);
        expect(fields).toMatchObject({
            CATEGORY_ID: '103',
            STAGE_ID: 'C103:PLAN',
            COMPANY_ID: '431',
            ASSIGNED_BY_ID: '251',
            TITLE: 'ТМЦ: ООО «Ромашка»',
            CONTACT_ID: '9',
        });
    });

    it('открытая ТМЦ-сделка есть — обновляется она, стадия не понижается', () => {
        const { service, set, update } = makeService();
        const ctx = makeCtx(
            {},
            {
                currentBaseDeal: {
                    ID: '500',
                    STAGE_ID: 'C103:IN_PROGRESS',
                    ASSIGNED_BY_ID: '251',
                },
            },
        );

        const result = service.queue(ctx);

        expect(result.baseDealId).toBe('500');
        expect(set).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledWith(
            'update_tmc_deal_500',
            500,
            expect.objectContaining({
                // Текущая стадия «презентация в работе» выше плана «звонок».
                STAGE_ID: 'C103:IN_PROGRESS',
                ASSIGNED_BY_ID: '251',
                COMPANY_ID: '431',
            }),
        );
    });

    it('план «Презентация» двигает ТМЦ-сделку в «презентация в работе»', () => {
        const { service, set } = makeService();
        const ctx = makeCtx({
            plan: {
                isPlanned: true,
                isActive: true,
                type: {
                    current: { code: 'presentation', name: 'Презентация' },
                },
                name: 'Демо СПС',
                deadline: '2026-11-05T12:00:00',
                responsibility: { ID: 251 },
                createdBy: { ID: 7 },
                contact: null,
            },
        });

        service.queue(ctx);

        expect(set.mock.calls[0][1]).toMatchObject({
            STAGE_ID: 'C103:IN_PROGRESS',
        });
    });

    it('отказ по результативному отчёту — «Отказ», по нерезультативному — «Не состоялась»', () => {
        const fail = (resultStatus: string) =>
            makeCtx(
                {
                    report: {
                        resultStatus,
                        description: '',
                        workStatus: { current: { code: 'fail' } },
                        failType: { current: { code: 'failure' } },
                    },
                    plan: { isPlanned: false, isActive: false },
                },
                { currentBaseDeal: { ID: '500', STAGE_ID: 'C103:PLAN' } },
            );

        const resultFail = makeService();
        resultFail.service.queue(fail('result'));
        expect(resultFail.update.mock.calls[0][2]).toMatchObject({
            STAGE_ID: 'C103:LOSE',
        });

        const noResultFail = makeService();
        noResultFail.service.queue(fail('noresult'));
        expect(noResultFail.update.mock.calls[0][2]).toMatchObject({
            STAGE_ID: 'C103:APOLOGY',
        });
    });

    it('новая задача без результата считается результативной (легаси): план — «План», не «Не состоялась»', () => {
        const { service, set } = makeService();
        const ctx = makeCtx({
            report: {
                resultStatus: 'new',
                description: '',
                workStatus: { current: { code: 'inJob' } },
            },
        });

        service.queue(ctx);

        expect(set.mock.calls[0][1]).toMatchObject({ STAGE_ID: 'C103:PLAN' });
    });

    it('без типа события и финала сделка не трогается; без воронки tmc_base — тоже', () => {
        const idle = makeService();
        idle.service.queue(
            makeCtx({
                plan: { isPlanned: false, isActive: false },
                report: {
                    resultStatus: null,
                    description: '',
                    workStatus: { current: { code: 'inJob' } },
                },
                currentTask: undefined,
            }),
        );
        expect(idle.set).not.toHaveBeenCalled();
        expect(idle.update).not.toHaveBeenCalled();

        const noCategory = makeService(makePortal(false));
        const result = noCategory.service.queue(makeCtx());
        expect(result.baseDealId).toBeNull();
        expect(noCategory.set).not.toHaveBeenCalled();
    });
});
