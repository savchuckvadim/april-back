import { Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { findBatchResult } from '../../shared/bitrix/prepare-batch-results.util';
import { EventReportContext } from '../../event-report/services/context/event-report.context';
import { EventReportLeadRequestSyncService } from '../../event-report/services/lead/event-report-lead-request-sync.service';
import { EventReportTaskFlowService } from '../../event-report/services/task/event-report-task-flow.service';
import {
    parseCreatedDealId,
    resolveKpiRowRefs,
    SideFlowJobBuildInput,
} from '../../event-report/services/post-flow/side-flow-job.base';
import { QuestionnaireSmartContextLoader } from '../../event-report/services/post-flow/questionnaire-smart-context.loader';
import {
    DeferredFlowStepKind,
    EnumDeferredFlowStepKind,
    EnumDeferredStepStatus,
    EventReportDeferredRequestDto,
    EventReportDeferredResultDto,
} from '../dto/event-report-deferred.dto';
import { DeferredStepDedupStore } from './deferred-step-dedup.store';
import { DeferredFlowContextFactory } from './deferred-flow-context.factory';
import { DeferredSideFlowDispatcher } from './deferred-side-flow.dispatcher';
import {
    DeferredBatchOutcome,
    DeferredBatchRunner,
} from './deferred-batch.runner';
import {
    buildDeferredResult,
    collectPayloadWarnings,
    DeferredStepEntry,
    pendingSteps,
    planDeferredSteps,
} from './deferred-step-plan';

/** Виды шагов, которые исполняет общий батч (сделки + KPI). */
const BATCH_STEP_KINDS: ReadonlySet<DeferredFlowStepKind> =
    new Set<DeferredFlowStepKind>([
        EnumDeferredFlowStepKind.presDeals,
        EnumDeferredFlowStepKind.xoDeals,
        EnumDeferredFlowStepKind.kpi,
    ]);

/**
 * Досылка ХВОСТА прямого исполнения отчёта (план А5).
 *
 * Что это такое. Отчёт по событию обычно исполняет бэк. Когда бэк молчит,
 * браузер исполняет ЯДРО отчёта сам (сущности, задача, история — то, на что
 * у менеджера есть права), а шаги без прав копит СЕМАНТИЧЕСКИМИ шагами в
 * конверте. Эта ручка их и довозит: KPI, движения сделок «Презентаций»/«ХО»,
 * элементы смартов ЗПР/«Презентаций», синк заявок, уведомление о переносе.
 *
 * Три жёстких правила:
 *  1. ЯДРО НЕ ПОВТОРЯЕТСЯ. Ни одной команды карточки, задачи или истории:
 *     их уже выполнил браузер. Читающий батч — можно (из него собирается
 *     контекст), писать — нельзя.
 *  2. ИСПОЛНЯЮТСЯ ТОЛЬКО ПЕРЕЧИСЛЕННЫЕ ШАГИ. Всё, чего нет в `steps`, не
 *     делается, даже если payload это подразумевает.
 *  3. ЧАСТИЧНЫЙ УСПЕХ. Один упавший шаг не роняет остальные, и исход
 *     КАЖДОГО шага виден в ответе — по нему фронт гасит конверт целиком
 *     либо оставляет в нём ровно неисполненные шаги.
 *
 * Идемпотентность трёхслойная: собственный дедуп KPI (`lists.element.get`),
 * детерминированный `jobId` сайд-джобов (`{operationId}:{flow}:{kind}`) и
 * отметка исполненных шагов в Redis ({@link DeferredStepDedupStore}).
 *
 * Инстанса bitrix у сервиса нет и быть не должно (CLAUDE.md): он рождается
 * на запрос в фабрике контекста и уезжает в исполнителей параметром.
 */
@Injectable()
export class EventReportDeferredService {
    private readonly logger = new Logger(EventReportDeferredService.name);

    constructor(
        private readonly contextFactory: DeferredFlowContextFactory,
        private readonly dedup: DeferredStepDedupStore,
        private readonly sideFlow: DeferredSideFlowDispatcher,
        // Контекст портальных анкет для сайд-джобов: тот же загрузчик, что
        // у координатора обычного flow (каталог + выключатель по типам).
        private readonly questionnaireContext: QuestionnaireSmartContextLoader,
    ) {}

    async execute(
        dto: EventReportDeferredRequestDto,
    ): Promise<EventReportDeferredResultDto> {
        const { domain, operationId } = dto;
        const entries = planDeferredSteps(dto.steps);
        const warnings = collectPayloadWarnings(dto);

        // Отметка ставится ДО исполнения: два одновременных запроса не
        // выполнят шаг дважды. Упавший шаг отметку теряет (см. fail).
        for (const entry of pendingSteps(entries)) {
            const reserved = await this.dedup.reserve(
                domain,
                operationId,
                entry.key,
            );
            if (!reserved) {
                entry.outcome.status = EnumDeferredStepStatus.duplicate;
                entry.outcome.detail = 'шаг этой операции уже исполнялся';
            }
        }

        const todo = pendingSteps(entries);
        if (!todo.length) {
            this.logger.log(
                `[deferred][${operationId}] ${domain}: исполнять нечего — ` +
                    'все шаги уже отработали',
            );
            return buildDeferredResult(dto, entries, 0, warnings);
        }

        let context: Awaited<ReturnType<DeferredFlowContextFactory['build']>>;
        try {
            context = await this.contextFactory.build(domain, dto.payload);
        } catch (error) {
            // Контекст не собрался — не выполнено НИЧЕГО: отметки снимаются,
            // конверт остаётся с полным хвостом и доедет следующей попыткой.
            const reason = `контекст отчёта не собран: ${(error as Error).message}`;
            for (const entry of todo) await this.fail(dto, entry, reason);
            this.logger.warn(`[deferred][${operationId}] ${domain}: ${reason}`);
            return buildDeferredResult(dto, entries, 0, warnings);
        }

        const { bitrix, portal, ctx } = context;
        const batch = await this.runBatchSteps(dto, todo, ctx, bitrix, portal);
        await this.runLeadRequestSync(dto, todo, ctx, bitrix, portal);
        await this.runTransferNotify(dto, todo, ctx, bitrix, portal);
        await this.runSideFlows(dto, todo, ctx, batch);

        const result = buildDeferredResult(
            dto,
            entries,
            batch.commandsCount,
            warnings,
        );
        this.logger.log(
            `[deferred][${operationId}] ${domain}: ` +
                entries
                    .map(entry => `${entry.key}=${entry.outcome.status}`)
                    .join(', ') +
                `, команд ${batch.commandsCount}`,
        );
        return result;
    }

    /** Сделки «Презентаций»/«ХО» и записи KPI — одним батчем. */
    private async runBatchSteps(
        dto: EventReportDeferredRequestDto,
        todo: ReadonlyArray<DeferredStepEntry>,
        ctx: EventReportContext,
        bitrix: BitrixService,
        portal: PortalModel,
    ): Promise<DeferredBatchOutcome> {
        const batchEntries = todo.filter(entry =>
            BATCH_STEP_KINDS.has(entry.kind),
        );
        const kinds = new Set(batchEntries.map(entry => entry.kind));
        const outcome = await new DeferredBatchRunner(bitrix, portal).run(
            ctx,
            kinds,
        );

        for (const entry of batchEntries) {
            const reason = outcome.failures.get(entry.kind);
            if (reason) await this.fail(dto, entry, reason);
            else this.succeed(entry);
        }
        return outcome;
    }

    /**
     * Синхронизация связанных заявок/лидов: статусы и история обработки —
     * тот же сервис, что у обычного flow, теми же двумя волнами.
     */
    private async runLeadRequestSync(
        dto: EventReportDeferredRequestDto,
        todo: ReadonlyArray<DeferredStepEntry>,
        ctx: EventReportContext,
        bitrix: BitrixService,
        portal: PortalModel,
    ): Promise<void> {
        const entry = todo.find(
            item => item.kind === EnumDeferredFlowStepKind.leadRequestSync,
        );
        if (!entry) return;

        try {
            const definitions = await this.contextFactory.leadLinkDefinitions(
                ctx.domain,
                bitrix,
                portal,
            );
            const result = await new EventReportLeadRequestSyncService(
                bitrix,
                portal,
                definitions,
            ).run(ctx);
            this.succeed(entry, `синхронизировано лидов: ${result.synced}`);
        } catch (error) {
            await this.fail(
                dto,
                entry,
                `синк заявок не выполнен: ${(error as Error).message}`,
            );
        }
    }

    /**
     * Уведомление ответственному о переносе (im.notify — не батчится).
     * Был ли перенос вообще, решает сам сервис по контексту: не перенос —
     * шаг честно исполнен без единого запроса.
     */
    private async runTransferNotify(
        dto: EventReportDeferredRequestDto,
        todo: ReadonlyArray<DeferredStepEntry>,
        ctx: EventReportContext,
        bitrix: BitrixService,
        portal: PortalModel,
    ): Promise<void> {
        const entry = todo.find(
            item => item.kind === EnumDeferredFlowStepKind.transferNotify,
        );
        if (!entry) return;

        try {
            // checklistEnabled=false: досылке чек-листы задач не нужны —
            // задачу она не трогает вовсе, зовётся только notifyTransfer.
            await new EventReportTaskFlowService(
                bitrix,
                portal,
                false,
            ).notifyTransfer(ctx);
            this.succeed(entry);
        } catch (error) {
            await this.fail(
                dto,
                entry,
                `уведомление о переносе не отправлено: ${(error as Error).message}`,
            );
        }
    }

    /** Элементы смартов ЗПР/«Презентаций» — постановка сайд-джобов. */
    private async runSideFlows(
        dto: EventReportDeferredRequestDto,
        todo: ReadonlyArray<DeferredStepEntry>,
        ctx: EventReportContext,
        batch: DeferredBatchOutcome,
    ): Promise<void> {
        const entries = todo.filter(
            item => item.kind === EnumDeferredFlowStepKind.sideFlow,
        );
        if (!entries.length) return;

        // Каталог анкет читается ОДИН раз на оба потока (загрузчик гасит
        // свои ошибки сам и отдаёт null — ответы просто не уедут в смарт).
        const questionnaire =
            await this.questionnaireContext.loadQuestionnaireSmartContext(
                ctx.dto,
            );
        // Обратные ссылки смартов — по строкам KPI, созданным ЭТИМ батчем
        // (шаг `kpi` в том же запросе); их нет — ссылок просто не будет.
        const kpiRowRefs = resolveKpiRowRefs(batch.kpiRows, batch.batchResults);
        // Сделка, созданная батчем ЭТОЙ ручки, — фолбэк к id из шага
        // (там лежит сделка, созданная прямым батчем браузера).
        const createdHere =
            parseCreatedDealId(
                findBatchResult(batch.batchResults, 'set_pres_deal'),
            ) ??
            parseCreatedDealId(
                findBatchResult(batch.batchResults, 'set_unplanned_pres_deal'),
            );

        for (const entry of entries) {
            const input: SideFlowJobBuildInput = {
                ctx,
                deals: batch.deals,
                planTaskId: entry.addedTaskId,
                createdPresDealId: entry.createdPresDealId ?? createdHere,
                kpiRowRefs,
                questionnaire,
                socketId: dto.socketId,
            };
            try {
                const dispatched = await this.sideFlow.dispatch(
                    // Поток проверен на этапе планирования (side-flow без
                    // flow — 400), поэтому здесь он гарантированно есть.
                    entry.flow!,
                    input,
                );
                this.succeed(
                    entry,
                    dispatched
                        ? `джобов поставлено: ${dispatched}`
                        : 'джобов нет — отчёт этого потока не касается',
                );
            } catch (error) {
                await this.fail(
                    dto,
                    entry,
                    `сайд-джоб не поставлен: ${(error as Error).message}`,
                );
            }
        }
    }

    private succeed(entry: DeferredStepEntry, detail?: string): void {
        entry.outcome.status = EnumDeferredStepStatus.executed;
        if (detail) entry.outcome.detail = detail;
    }

    /**
     * Шаг не выполнен: отметка дедупа СНИМАЕТСЯ — иначе повтор конверта
     * отвергался бы как дубль, и хвост был бы потерян навсегда.
     */
    private async fail(
        dto: EventReportDeferredRequestDto,
        entry: DeferredStepEntry,
        detail: string,
    ): Promise<void> {
        entry.outcome.status = EnumDeferredStepStatus.failed;
        entry.outcome.detail = detail;
        await this.dedup.release(dto.domain, dto.operationId, entry.key);
    }
}
