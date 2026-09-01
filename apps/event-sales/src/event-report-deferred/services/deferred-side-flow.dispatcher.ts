import { Injectable, Logger } from '@nestjs/common';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import {
    SideFlowJobBuildInput,
    SideFlowJobKind,
    sideJobId,
} from '../../event-report/services/post-flow/side-flow-job.base';
import { buildZprFlowJobs } from '../../event-report/services/post-flow/zpr-flow-job.builder';
import { buildPresentationFlowJobs } from '../../event-report/services/post-flow/presentation-flow-job.builder';
import {
    DeferredSideFlow,
    EnumDeferredSideFlow,
} from '../dto/event-report-deferred.dto';

/** Адрес очереди одного потока + его имя в jobId и логах. */
interface DeferredSideFlowSpec {
    queue: QueueNames;
    job: JobNames;
    /** Часть детерминированного jobId (`{operationId}:{flow}:{kind}`). */
    flow: DeferredSideFlow;
    label: string;
    build: (input: SideFlowJobBuildInput) => Array<{ kind: SideFlowJobKind }>;
}

/**
 * Реестр потоков. Адреса очередей, значения `flow` и БИЛДЕРЫ джобов — те же
 * самые, что у координатора `EventReportPostFlowService`; здесь отличается
 * только гранулярность: координатор всегда раскладывает ОБА потока разом,
 * а досылка обязана уметь один (фронт вправе повторить ровно упавший шаг).
 */
const SIDE_FLOW_SPECS: Readonly<
    Record<DeferredSideFlow, DeferredSideFlowSpec>
> = {
    [EnumDeferredSideFlow.zpr]: {
        queue: QueueNames.EVENT_SALES_ZPR_FLOW,
        job: JobNames.EVENT_SALES_ZPR_FLOW,
        flow: EnumDeferredSideFlow.zpr,
        label: 'zpr-flow',
        build: buildZprFlowJobs,
    },
    [EnumDeferredSideFlow.pres]: {
        queue: QueueNames.EVENT_SALES_PRESENTATION_FLOW,
        job: JobNames.EVENT_SALES_PRESENTATION_FLOW,
        flow: EnumDeferredSideFlow.pres,
        label: 'presentation-flow',
        build: buildPresentationFlowJobs,
    },
};

/**
 * Постановка сайд-джобов ОДНОГО потока для досылки хвоста.
 *
 * Сборку джобов делают те же экспортированные билдеры, что и у обычного
 * flow (`buildZprFlowJobs` / `buildPresentationFlowJobs`) — ни строки
 * доменной логики здесь не продублировано. Идемпотентность — детерминированный
 * `jobId` вида `{operationId}:{flow}:{kind}`: очередь второй такой джоб не
 * заведёт.
 *
 * Порядок джобов внутри потока СТРОГИЙ («сначала report, потом plan») и
 * обрывается на первой неудаче — ровно как в координаторе: план, приехавший
 * раньше отчёта, заводит новый элемент смарта, который становится «открытым»
 * для своего же отчёта.
 *
 * Инстанса bitrix у сервиса нет и быть не должно (CLAUDE.md).
 */
@Injectable()
export class DeferredSideFlowDispatcher {
    private readonly logger = new Logger(DeferredSideFlowDispatcher.name);

    constructor(private readonly queue: QueueDispatcherService) {}

    /**
     * @returns число поставленных джобов; поток без джобов (отчёт этого
     * потока не касается) — честный 0, это не ошибка.
     * @throws ошибку постановки — исход шага решает вызывающий.
     */
    async dispatch(
        flow: DeferredSideFlow,
        input: SideFlowJobBuildInput,
    ): Promise<number> {
        const spec = SIDE_FLOW_SPECS[flow];
        const jobs = spec.build(input);
        if (!jobs.length) {
            this.logger.log(
                `[deferred] ${input.ctx.domain}: ${spec.label} — джобов нет ` +
                    `(отчёт потока не касается), operationId=` +
                    `${input.ctx.dto.operationId ?? 'нет'}`,
            );
            return 0;
        }

        const operationId = input.ctx.dto.operationId;
        let dispatched = 0;
        for (const data of jobs) {
            await this.queue.dispatch(
                spec.queue,
                spec.job,
                data,
                sideJobId(operationId, spec.flow, data.kind),
                { removeOnComplete: true, removeOnFail: true },
            );
            dispatched += 1;
        }

        this.logger.log(
            `[deferred] ${input.ctx.domain}: ${spec.label} — досланы джобы ` +
                `(${jobs.map(job => job.kind).join(', ')}), план-задача ` +
                `${input.planTaskId ?? 'не создана'}, operationId=` +
                `${operationId ?? 'нет'}`,
        );
        return dispatched;
    }
}
