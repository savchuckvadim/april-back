import { DeferredSideFlowDispatcher } from '../services/deferred-side-flow.dispatcher';
import { EnumDeferredSideFlow } from '../dto/event-report-deferred.dto';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { SideFlowJobBuildInput } from '../../event-report/services/post-flow/side-flow-job.base';

/**
 * Постановка сайд-джобов досылки.
 *
 * Билдеры джобов замоканы — их состав покрыт спеками самих потоков. Здесь
 * важны две вещи: досылка умеет ОДИН поток (координатор обычного flow всегда
 * ставит оба, а фронт вправе повторить ровно упавший шаг) и `jobId` остаётся
 * детерминированным `{operationId}:{flow}:{kind}` — на нём держится
 * идемпотентность очереди.
 */

const zprJobs: Array<{ kind: string }> = [];
const presJobs: Array<{ kind: string }> = [];

jest.mock('../../event-report/services/post-flow/zpr-flow-job.builder', () => ({
    buildZprFlowJobs: () => zprJobs,
}));
jest.mock(
    '../../event-report/services/post-flow/presentation-flow-job.builder',
    () => ({
        buildPresentationFlowJobs: () => presJobs,
    }),
);

const input = (operationId?: string): SideFlowJobBuildInput =>
    ({
        ctx: {
            domain: 'portal.bitrix24.ru',
            dto: { operationId },
        },
        deals: {
            baseDealId: null,
            newPlanPresDealId: null,
            newUnplannedPresDealId: null,
        },
        planTaskId: 777,
        questionnaire: null,
    }) as unknown as SideFlowJobBuildInput;

const makeDispatcher = () => {
    const dispatch = jest.fn<Promise<unknown>, unknown[]>(() =>
        Promise.resolve({}),
    );
    const dispatcher = new DeferredSideFlowDispatcher({
        dispatch,
    } as unknown as QueueDispatcherService);
    return { dispatcher, dispatch };
};

describe('DeferredSideFlowDispatcher — постановка сайд-джобов досылки', () => {
    beforeEach(() => {
        zprJobs.length = 0;
        presJobs.length = 0;
    });

    it('ставит джобы только запрошенного потока, с jobId {operationId}:{flow}:{kind}', async () => {
        zprJobs.push({ kind: 'report' }, { kind: 'plan' });
        presJobs.push({ kind: 'report' });
        const { dispatcher, dispatch } = makeDispatcher();

        const dispatched = await dispatcher.dispatch(
            EnumDeferredSideFlow.zpr,
            input('op-1'),
        );

        expect(dispatched).toBe(2);
        expect(dispatch).toHaveBeenCalledTimes(2);
        expect(dispatch.mock.calls.map(call => call.slice(0, 4))).toEqual([
            [
                QueueNames.EVENT_SALES_ZPR_FLOW,
                JobNames.EVENT_SALES_ZPR_FLOW,
                { kind: 'report' },
                'op-1:zpr:report',
            ],
            [
                QueueNames.EVENT_SALES_ZPR_FLOW,
                JobNames.EVENT_SALES_ZPR_FLOW,
                { kind: 'plan' },
                'op-1:zpr:plan',
            ],
        ]);
    });

    it('поток «Презентации» уходит в свою очередь', async () => {
        presJobs.push({ kind: 'report' });
        const { dispatcher, dispatch } = makeDispatcher();

        await dispatcher.dispatch(EnumDeferredSideFlow.pres, input('op-1'));

        expect(dispatch.mock.calls[0].slice(0, 2)).toEqual([
            QueueNames.EVENT_SALES_PRESENTATION_FLOW,
            JobNames.EVENT_SALES_PRESENTATION_FLOW,
        ]);
        expect(dispatch.mock.calls[0][3]).toBe('op-1:pres:report');
    });

    it('поток без джобов — честный ноль, а не ошибка (отчёт его не касается)', async () => {
        const { dispatcher, dispatch } = makeDispatcher();

        expect(
            await dispatcher.dispatch(EnumDeferredSideFlow.zpr, input('op-1')),
        ).toBe(0);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('порядок обрывается на первой неудаче: план не уедет раньше отчёта', async () => {
        zprJobs.push({ kind: 'report' }, { kind: 'plan' });
        const { dispatcher, dispatch } = makeDispatcher();
        dispatch.mockRejectedValueOnce(new Error('очередь недоступна'));

        await expect(
            dispatcher.dispatch(EnumDeferredSideFlow.zpr, input('op-1')),
        ).rejects.toThrow('очередь недоступна');
        expect(dispatch).toHaveBeenCalledTimes(1);
    });
});
