import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
import {
    EnumEventItemResultType,
    EnumWorkStatusCode,
} from '../types/report-types';
import {
    ReportTaskFlags,
    reportClosesTask,
    reportTaskFlagsOf,
} from '../services/task/report-closes-task';

const flags = (over: Partial<ReportTaskFlags> = {}): ReportTaskFlags => ({
    isMove: false,
    isNew: false,
    isNoResult: false,
    isNoCall: false,
    isFinal: false,
    ...over,
});

/**
 * Одно правило на поток задач и на гард повторной отправки: закрывает ли
 * отчёт дело, по которому отправлен.
 */
describe('reportClosesTask', () => {
    it('состоявшийся звонок закрывает дело', () => {
        expect(reportClosesTask(flags())).toBe(true);
    });

    it('перенос и новое событие дело не закрывают', () => {
        expect(reportClosesTask(flags({ isMove: true }))).toBe(false);
        expect(reportClosesTask(flags({ isNew: true }))).toBe(false);
    });

    it('нерезультативный звонок и недозвон: без финала — нет, с финалом — да', () => {
        expect(reportClosesTask(flags({ isNoResult: true }))).toBe(false);
        expect(reportClosesTask(flags({ isNoCall: true }))).toBe(false);
        expect(
            reportClosesTask(flags({ isNoResult: true, isFinal: true })),
        ).toBe(true);
        expect(reportClosesTask(flags({ isNoCall: true, isFinal: true }))).toBe(
            true,
        );
    });
});

const dto = (over: {
    resultStatus: EnumEventItemResultType | null;
    workStatus: EnumWorkStatusCode;
    planActive: boolean;
    isNoCall?: boolean;
}): EventSalesFlowDto =>
    ({
        report: {
            resultStatus: over.resultStatus,
            workStatus: { current: { code: over.workStatus } },
            isNoCall: Boolean(over.isNoCall),
        },
        plan: { isActive: over.planActive },
    }) as unknown as EventSalesFlowDto;

describe('reportTaskFlagsOf: признаки из присланного отчёта', () => {
    it('перенос — не состоялся, не финал, есть план', () => {
        expect(
            reportTaskFlagsOf(
                dto({
                    resultStatus: EnumEventItemResultType.NORESULT,
                    workStatus: EnumWorkStatusCode.inJob,
                    planActive: true,
                }),
            ),
        ).toEqual(flags({ isMove: true, isNoResult: true }));
    });

    it('отказ без плана — финал, не перенос', () => {
        expect(
            reportTaskFlagsOf(
                dto({
                    resultStatus: EnumEventItemResultType.RESULT,
                    workStatus: EnumWorkStatusCode.fail,
                    planActive: false,
                }),
            ),
        ).toEqual(flags({ isFinal: true }));
    });

    it('быстрый «Недозвон» из списка — без типа результата', () => {
        expect(
            reportTaskFlagsOf(
                dto({
                    resultStatus: null,
                    workStatus: EnumWorkStatusCode.inJob,
                    planActive: false,
                    isNoCall: true,
                }),
            ),
        ).toEqual(flags({ isNoCall: true }));
    });
});
