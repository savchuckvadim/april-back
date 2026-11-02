import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../services/context/event-report.context';
import { EventReportReturnToTmcService } from '../services/return-to-tmc/event-report-return-to-tmc.service';

/**
 * Возврат в ТМЦ как в легаси: задача ТМЦ-менеджера на презентацию получает
 * срок «через сутки» и название «Звонок: вернули из ОП», компания уходит
 * ТМЦ-менеджеру. Стадия ТМЦ-сделки не трогается (владелец, 02.11.2026).
 */
const TMC_DEAL = { ID: '213065', ASSIGNED_BY_ID: '611', COMPANY_ID: '95857' };

const makeCtx = (over: Record<string, unknown> = {}): EventReportContext =>
    ({
        domain: 'gsr.bitrix24.ru',
        isNeedReturnToTmc: true,
        dto: {
            returnToTmc: {
                isActive: true,
                data: { taskId: 1, tmcDeal: TMC_DEAL },
            },
        },
        currentTmcDeal: null,
        currentTmcFromPresentation: null,
        company: { ID: 95857 },
        dateTime: { taskDeadline: () => '2026-11-03 12:00:00' },
        ...over,
    }) as unknown as EventReportContext;

const makeService = (tasks: { id: number | string }[] = [{ id: '351519' }]) => {
    const getList = jest.fn().mockResolvedValue({ result: { tasks } });
    const taskUpdate = jest.fn().mockResolvedValue({});
    const companyUpdate = jest.fn().mockResolvedValue({});
    const service = new EventReportReturnToTmcService(
        {
            task: { getList, update: taskUpdate },
            company: { update: companyUpdate },
        } as unknown as BitrixService,
        { getSalesTaskGroupId: () => 41 } as unknown as PortalModel,
    );
    return { service, getList, taskUpdate, companyUpdate };
};

describe('EventReportReturnToTmcService', () => {
    it('ищет задачу «Презентация» ТМЦ-менеджера по компании и ТМЦ-сделке, двигает срок и название', async () => {
        const { service, getList, taskUpdate } = makeService();

        await service.apply(makeCtx());

        expect(getList).toHaveBeenCalledWith(
            {
                '%TITLE': 'Презентация',
                GROUP_ID: 41,
                UF_CRM_TASK: ['CO_95857', 'D_213065'],
                RESPONSIBLE_ID: 611,
                '!=STATUS': '5',
            },
            ['ID', 'TITLE'],
        );
        expect(taskUpdate).toHaveBeenCalledWith(351519, {
            DEADLINE: '2026-11-03 12:00:00',
            ALLOW_CHANGE_DEADLINE: 'Y',
            TITLE: 'Звонок: вернули из ОП',
        });
    });

    it('компания переназначается на ТМЦ-менеджера', async () => {
        const { service, companyUpdate } = makeService();
        await service.apply(makeCtx());
        expect(companyUpdate).toHaveBeenCalledWith(95857, {
            ASSIGNED_BY_ID: '611',
        });
    });

    it('задачи у ТМЦ-менеджера нет — только компания', async () => {
        const { service, taskUpdate, companyUpdate } = makeService([]);
        await service.apply(makeCtx());
        expect(taskUpdate).not.toHaveBeenCalled();
        expect(companyUpdate).toHaveBeenCalledTimes(1);
    });

    it('в payload сделки нет (легаси шлёт false) — берётся ТМЦ-сделка контекста', async () => {
        const { service, companyUpdate } = makeService();
        await service.apply(
            makeCtx({
                dto: { returnToTmc: { isActive: true, data: false } },
                currentTmcDeal: { ...TMC_DEAL, ASSIGNED_BY_ID: '7' },
            }),
        );
        expect(companyUpdate).toHaveBeenCalledWith(95857, {
            ASSIGNED_BY_ID: '7',
        });
    });

    it('возврат не запрошен или сделка без ответственного — ничего не делает', async () => {
        const { service, getList, companyUpdate } = makeService();
        await service.apply(makeCtx({ isNeedReturnToTmc: false }));
        await service.apply(
            makeCtx({
                dto: {
                    returnToTmc: {
                        isActive: true,
                        data: { tmcDeal: { ID: '1', ASSIGNED_BY_ID: '0' } },
                    },
                },
            }),
        );
        expect(getList).not.toHaveBeenCalled();
        expect(companyUpdate).not.toHaveBeenCalled();
    });

    it('ошибка Битрикса на задаче не мешает передать компанию', async () => {
        const { service, getList, companyUpdate } = makeService();
        getList.mockRejectedValue(new Error('bitrix down'));
        await service.apply(makeCtx());
        expect(companyUpdate).toHaveBeenCalledTimes(1);
    });
});
