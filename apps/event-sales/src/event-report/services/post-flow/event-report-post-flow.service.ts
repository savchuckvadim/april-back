import { Injectable, Logger } from '@nestjs/common';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { findBatchResult } from '../../../shared/bitrix/prepare-batch-results.util';
import { EventReportContext } from '../context/event-report.context';
import { DealFlowResult } from '../deal/event-report-deal-flow.service';
import {
    ADD_TASK_CMD,
    parseAddedTaskId,
} from '../task/event-report-task-flow.service';
import {
    SideFlowJobBuildInput,
    SideFlowJobKind,
    sideJobId,
    parseCreatedDealId,
    resolveKpiRowRefs,
} from './side-flow-job.base';
import { KpiRowCmd } from '../kpi-list/event-report-kpi-flow.service';
import { buildZprFlowJobs } from './zpr-flow-job.builder';
import { buildPresentationFlowJobs } from './presentation-flow-job.builder';
import { QuestionnaireSmartContextLoader } from './questionnaire-smart-context.loader';

/** Адрес очереди одного потока плюс тексты, которыми он себя называет. */
interface SideFlowQueueSpec {
    queue: QueueNames;
    job: JobNames;
    /** Часть детерминированного jobId (`{operationId}:{flow}:{kind}`). */
    flow: string;
    /** Имя потока в логах — то же, что было в use-case. */
    label: string;
}

const ZPR_QUEUE: SideFlowQueueSpec = {
    queue: QueueNames.EVENT_SALES_ZPR_FLOW,
    job: JobNames.EVENT_SALES_ZPR_FLOW,
    flow: 'zpr',
    label: 'zpr-flow',
};

const PRESENTATION_QUEUE: SideFlowQueueSpec = {
    queue: QueueNames.EVENT_SALES_PRESENTATION_FLOW,
    job: JobNames.EVENT_SALES_PRESENTATION_FLOW,
    flow: 'pres',
    label: 'presentation-flow',
};

/**
 * Координатор сайд-flow: всё, что происходит ПОСЛЕ основного батча отчёта.
 *
 * Элементы смартов (ЗПР и «Презентации») доезжают отдельными очередями —
 * отчёт отвечает «предварительно готово» и не удлиняется на их запись
 * (решение владельца, 2508). Здесь координатор:
 *  1. дочитывает id план-задачи из ответа УЖЕ отправленного батча;
 *  2. один раз на оба потока просит у загрузчика контекст портальных анкет;
 *  3. отдаёт сборку джобов билдерам потоков и кладёт их в очереди.
 *
 * Чтение каталога анкет и настроек портала — ответственность
 * {@link QuestionnaireSmartContextLoader}: у неё свои внешние зависимости и
 * свои режимы деградации, и в координаторе, который занят раскладкой по
 * очередям, им делать нечего.
 *
 * Инстанса bitrix у сервиса нет и быть не должно (CLAUDE.md): в него
 * инжектятся только stateless-сервисы, а всё доменное приезжает аргументом.
 */
@Injectable()
export class EventReportPostFlowService {
    private readonly logger = new Logger(EventReportPostFlowService.name);

    constructor(
        private readonly queue: QueueDispatcherService,
        // Контекст портальных анкет: каталог + выключатель по типам события.
        private readonly questionnaireContext: QuestionnaireSmartContextLoader,
    ) {}

    async dispatch(input: {
        ctx: EventReportContext;
        deals: DealFlowResult;
        /** Ответ основного батча — источник id созданной план-задачи. */
        batchResults: IBitrixBatchResponseResult[];
        /** Команды создания строк KPI/History — для обратных ссылок смартов. */
        kpiRows?: KpiRowCmd[];
        socketId?: string;
    }): Promise<void> {
        const { ctx, deals, batchResults, socketId } = input;

        /*
         * id план-задачи достаём из ответа ТОГО ЖЕ батча: команда
         * `add_task` уже выполнена, её результат лежит в ответе — ни
         * одного лишнего запроса в Битрикс. Раньше этого id не было, и
         * плановый элемент оставался без привязки к задаче до следующего
         * отчёта по ней.
         */
        const planTaskId = parseAddedTaskId(
            findBatchResult(batchResults, ADD_TASK_CMD),
        );

        /*
         * Той же механикой — реальный id pres-сделки, СОЗДАННОЙ этим
         * отчётом: на постановке она была `$result[...]` и в контексте
         * лежит null. Теперь ЗПР, запланированный вместе с отчётом по
         * презентации (или после unplanned-презентации), получает связь
         * ZPR_PRES_DEAL сразу, а элемент презентации — свою PRES_DEAL
         * (решение владельца 31.08).
         */
        const presDealId =
            parseCreatedDealId(
                findBatchResult(batchResults, 'set_pres_deal'),
            ) ??
            parseCreatedDealId(
                findBatchResult(batchResults, 'set_unplanned_pres_deal'),
            );

        // Строки KPI/History, созданные этим же батчем: cmd → реальный id.
        // По сценарию строки решается, ПЛАНОВЫЙ или ОТЧЁТНЫЙ элемент смарта
        // должен в неё дописаться.
        const kpiRowRefs = resolveKpiRowRefs(input.kpiRows ?? [], batchResults);

        // Ответы портальных анкет, адресованные элементам смартов:
        // каталог и выключатель читаются один раз на оба потока.
        const questionnaire =
            await this.questionnaireContext.loadQuestionnaireSmartContext(
                ctx.dto,
            );

        const buildInput: SideFlowJobBuildInput = {
            ctx,
            deals,
            planTaskId,
            createdPresDealId: presDealId,
            kpiRowRefs,
            questionnaire,
            socketId,
        };
        const zprJobs = this.build(ZPR_QUEUE, () =>
            buildZprFlowJobs(buildInput),
        );
        const presentationJobs = this.build(PRESENTATION_QUEUE, () =>
            buildPresentationFlowJobs(buildInput),
        );
        // Ни один поток отчёт не касается — постановка молчит целиком,
        // иначе телеграм-канал забивался бы записями «ничего не сделано».
        if (!zprJobs.length && !presentationJobs.length) return;

        // Потоки ставятся ОТДЕЛЬНЫМИ вызовами — это и есть граница
        // независимости: сорвавшийся ЗПР не мешает презентациям и наоборот.
        await this.enqueue(ZPR_QUEUE, zprJobs, ctx);
        await this.enqueue(PRESENTATION_QUEUE, presentationJobs, ctx);

        const kinds = [
            ...zprJobs.map(job => `${ZPR_QUEUE.flow}:${job.kind}`),
            ...presentationJobs.map(
                job => `${PRESENTATION_QUEUE.flow}:${job.kind}`,
            ),
        ];
        /*
         * Один дев-лог на весь post-flow вместо россыпи отладочных: по нему
         * видно и состав разложенных джобов, и доехал ли id план-задачи.
         *
         * Штатный успешный путь — ОБЫЧНЫЙ `log` без `{ telegram: true }`.
         * Форс-флаг шлёт запись в общий канал, а транспорт логгера режет
         * поток скользящим окном (20 сообщений в минуту) и лишнее МОЛЧА
         * дропает: рутинные «сайд-джобов 2» на каждом отчёте вытеснили бы
         * аварийные алерты кронов call-report — единственных сегодняшних
         * жильцов канала. В Telegram уезжают только диагностические ветки
         * ниже: там что-то УЖЕ не так.
         */
        this.logger.log(
            `[post-flow] ${ctx.domain}: сайд-джобов ${kinds.length} ` +
                `(${kinds.join(', ')}), план-задача ` +
                `${planTaskId ?? 'не создана'}`,
            {
                domain: ctx.domain,
                operationId: ctx.dto.operationId,
                planTaskId,
                kinds,
            },
        );

        this.warnMissingPlanTaskId(ctx, kinds, planTaskId);
    }

    /**
     * План запланирован, а id задачи из ответа батча не прочитался.
     *
     * Ровно этот симптом делал фичу мёртвой: плановый элемент смарта
     * создаётся без привязки к задаче и остаётся сиротой до следующего
     * отчёта по ней. Причин две и обе внешние — команда `add_task` не
     * выполнилась (чанк батча вернул ошибку) либо ответ приехал не в той
     * форме, — поэтому увидеть это надо СРАЗУ, а не при разборе жалобы.
     *
     * Отсюда `{ telegram: true }`: форс-отправка записи в канал (транспорт
     * шлёт её независимо от уровня). Текст самодостаточный — в канале нет
     * ни контекста вокруг, ни возможности «посмотреть строкой выше».
     */
    private warnMissingPlanTaskId(
        ctx: EventReportContext,
        kinds: string[],
        planTaskId: number | null,
    ): void {
        const isPlanned = kinds.some(kind => kind.endsWith(':plan'));
        if (!isPlanned || planTaskId !== null) return;

        this.logger.warn(
            `[post-flow] ${ctx.domain}: план запланирован ` +
                `(${kinds.join(', ')}), но id план-задачи из ответа батча ` +
                `не прочитан (команда ${ADD_TASK_CMD}) — плановый элемент ` +
                'смарта уедет без привязки к задаче. operationId=' +
                `${ctx.dto.operationId ?? 'нет'}`,
            {
                telegram: true,
                domain: ctx.domain,
                operationId: ctx.dto.operationId,
                kinds,
            },
        );
    }

    /**
     * Сборка джобов ОДНОГО потока под защитой: основной батч уже отправлен,
     * отчёт в Битриксе состоялся — уронить его из-за сломанной раскладки
     * сайд-очереди нельзя (в use-case эти вызовы жили внутри `catch` ровно
     * поэтому). Соседний поток при этом продолжает работать.
     */
    private build<T>(spec: SideFlowQueueSpec, build: () => T[]): T[] {
        try {
            return build();
        } catch (error) {
            this.logger.warn(
                `${spec.label} не поставлен в очередь: ` +
                    `${(error as Error).message}`,
            );
            return [];
        }
    }

    /**
     * Постановка джобов ОДНОГО потока.
     *
     * Отчёт уронить нельзя — основной батч уже отправлен, отчёт в Битриксе
     * состоялся, — поэтому ошибка постановки только логируется. Но внутри
     * потока джобы НЕ независимы: билдер выдаёт их строго в порядке
     * «сначала report, потом plan», и порядок этот обязателен — план,
     * приехавший раньше отчёта, заводит новый элемент смарта, который
     * становится «открытым» для СВОЕГО ЖЕ отчёта.
     *
     * Отсюда `break`, а не `continue`: если упала постановка report'а, то
     * поставленный следом plan-джоб дал бы худшее из состояний — в смарте
     * появился бы открытый плановый элемент, отчёта по которому не было, а
     * старый остался бы незакрытым, и следующий отчёт закрыл бы не тот
     * элемент. Пропустить оба и оставить смарт в прежнем (согласованном)
     * виде — дешевле: ручной разбор одного отчёта против расползающейся
     * рассинхронизации. Прежняя семантика «упавший поток не мешает
     * соседнему» сохранена тем, что ЗПР и презентации ставятся разными
     * вызовами `enqueue`.
     */
    private async enqueue(
        spec: SideFlowQueueSpec,
        jobs: ReadonlyArray<{ kind: SideFlowJobKind }>,
        ctx: EventReportContext,
    ): Promise<void> {
        const operationId = ctx.dto.operationId;
        for (const data of jobs) {
            try {
                await this.queue.dispatch(
                    spec.queue,
                    spec.job,
                    data,
                    sideJobId(operationId, spec.flow, data.kind),
                    { removeOnComplete: true, removeOnFail: true },
                );
            } catch (error) {
                /*
                 * Диагностическая ветка: сайд-очередь недоступна, элемент
                 * смарта по этому отчёту не появится вовсе. Форсим в канал
                 * (`{ telegram: true }`) — текст самодостаточный, потому
                 * что вокруг записи в канале контекста не будет.
                 */
                this.logger.warn(
                    `[post-flow] ${ctx.domain}: ${spec.label} — джоб ` +
                        `«${data.kind}» не поставлен в очередь ` +
                        `(${(error as Error).message}); остаток потока ` +
                        'пропущен, чтобы план не уехал раньше отчёта. ' +
                        `operationId=${operationId ?? 'нет'}`,
                    {
                        telegram: true,
                        domain: ctx.domain,
                        operationId,
                        flow: spec.flow,
                        kind: data.kind,
                    },
                );
                break;
            }
        }
    }
}
