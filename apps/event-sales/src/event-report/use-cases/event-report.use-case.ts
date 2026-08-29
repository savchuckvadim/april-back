import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx/pbx.service';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    EnumEventSmartFlow,
    findSmartKindByFlow,
    PBX_SALES_EVENT_FIELD_CODES,
} from '@lib/portal-lib/pbx';
import {
    parseQuestionnaireDisabledEventTypes,
    PortalQuestionnairesService,
    QuestionnaireCatalog,
} from '@lib/portal-lib/store/questionnaires';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    LeadUfDefinitions,
    LeadUfDefinitionsService,
} from '../../shared/portal-fields';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
import { EventReportInitService } from '../services/init/event-report-init.service';
import {
    EEventReportFlowStrategy,
    EventReportContext,
} from '../services/context/event-report.context';
import { EventReportEntityFlowService } from '../services/entity/event-report-entity-flow.service';
import {
    DEFAULT_FIELD_POLICY_SETTINGS,
    EventFieldPolicySettings,
} from '../services/entity/field-policy';
import { EventReportDealFlowService } from '../services/deal/event-report-deal-flow.service';
import { EventReportTaskFlowService } from '../services/task/event-report-task-flow.service';
import { EventReportKpiFlowService } from '../services/kpi-list/event-report-kpi-flow.service';
import { EventReportPostFailService } from '../services/post-fail/event-report-post-fail.service';
import { EventReportLeadRelationService } from '../services/lead/event-report-lead-relation.service';
import { EventReportLeadRequestSyncService } from '../services/lead/event-report-lead-request-sync.service';
import { EventReportReturnToTmcService } from '../services/return-to-tmc/event-report-return-to-tmc.service';
import { EventReportEntityHistoryService } from '../services/history/event-report-entity-history.service';
import { ColdHookBatchGroupBuffer } from '../../cold-hook/services/batch/cold-hook-batch-group-buffer';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { EEventReportEntityType } from '../services/init/event-report-init.types';
import { ZprFlowJobData } from '../../zpr-flow/dto/zpr-flow-job.dto';
import { PresentationFlowJobData } from '../../presentation-flow/dto/presentation-flow-job.dto';
import {
    derivePresentationOutcome,
    isPresentationMoveOutcome,
} from '../../presentation-flow/lib/presentation-outcome';
import { buildPresentationSurveySnapshot } from '../../presentation-flow/lib/presentation-survey-snapshot';
import {
    buildQuestionnaireSmartAnswers,
    findLostQuestionnaireAnswers,
    QuestionnaireAnswerLike,
    QuestionnaireAnswerPurpose,
    QuestionnaireSmartAnswer,
} from '../../shared/questionnaire-answers';

/**
 * Смарт, элемент которого ведёт каждая сайд-очередь. Читаем из реестра
 * типов события, а не пишем строкой: связь «тип события ↔ смарт ↔
 * поток» обязана жить в одном месте.
 */
const PRESENTATION_SMART_KIND = findSmartKindByFlow(
    EnumEventSmartFlow.presentation,
);
const ZPR_SMART_KIND = findSmartKindByFlow(EnumEventSmartFlow.zpr);

/**
 * Всё, что нужно, чтобы разложить ответы портальных анкет по потокам:
 * состав вопросов, сами ответы и выключатель по типам события.
 * Читается ОДИН раз на отчёт и только когда ответы вообще пришли.
 */
interface QuestionnaireSmartContext {
    catalog: QuestionnaireCatalog;
    answers: QuestionnaireAnswerLike[];
    disabledEventTypes: string[];
}

/**
 * Назначения анкет, которые ДОЕДУТ до элемента смарта.
 *
 * Обычно джоб несёт своё назначение — план в плановый элемент, отчёт в
 * отчётный. Исключение одно: ПЕРЕНОС. План-джоб на нём не ставится (он
 * завёл бы второй открытый элемент), а элемент один и на отчёт, и на
 * новый план — поэтому report-джоб переноса несёт оба назначения, ровно
 * так же, как их раскладывает поток. Всё, что сюда не попало, записать
 * некуда, и об этом обязан быть warning.
 */
const coveredAnswerPurposes = (
    kinds: ReadonlyArray<'report' | 'plan'>,
    isMove: boolean,
): ReadonlySet<QuestionnaireAnswerPurpose> => {
    const covered = new Set<QuestionnaireAnswerPurpose>(kinds);
    if (isMove && kinds.includes('report')) covered.add('plan');
    return covered;
};

/**
 * Оркестратор event-report flow.
 *
 * Шаги:
 *  1. `PBXService.init(domain)` — получить инстанс bitrix + portal.
 *  2. `EventReportInitService.loadContext` — один HTTP-batch:
 *     company/lead, deals по 4 категориям, task, lead, контакты.
 *  3. Сконструировать {@link EventReportContext} (все флаги).
 *  4. Прогнать flow-сервисы (entity → deal → task → kpi → presentation list →
 *     post-fail → lead → return-to-tmc → history) — каждый просто queue'ит
 *     команды в `bitrix.batch.*`.
 *  5. Один финальный `bitrix.api.callBatchWithConcurrency(1)` отправит всё
 *     одним HTTP-вызовом (рассчитываем на ≤50 команд).
 */
@Injectable()
export class EventReportUseCase {
    private readonly logger = new Logger(EventReportUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly initService: EventReportInitService,
        private readonly ufDefinitions: LeadUfDefinitionsService,
        private readonly queue: QueueDispatcherService,
        // Гейт чек-листов задач: настройка портала (Redis-кэш 300 с).
        private readonly appSettings: PortalAppSettingsService,
        // Портальный каталог анкет (Redis-кэш 300 с): по нему ответы
        // фрейма получают адрес поля в элементе смарта.
        private readonly questionnaires: PortalQuestionnairesService,
    ) {}

    async execute(
        dto: EventSalesFlowDto,
        // Сокет клиента: уезжает в сайд-джобы, чтобы их `…:done` вернулся
        // точечно тому же клиенту (userId в роли адреса не годится — он
        // уникален только в рамках портала).
        socketId?: string,
    ): Promise<{
        success: boolean;
        commandsCount: number;
        entityType: string;
        entityId: number;
    }> {
        const { bitrix, PortalModel: portal } = await this.pbx.init(dto.domain);

        const init = await this.initService.loadContext(dto, bitrix, portal);
        const ctx = new EventReportContext(dto, portal, init);
        // Классы поведения полей карточки — одним чтением настроек на отчёт:
        // модель полей собирается шесть раз (компания, лид, 4 роли сделок).
        ctx.setFieldPolicySettings(
            await this.resolveFieldPolicySettings(dto.domain),
        );

        const entityFlow = new EventReportEntityFlowService(bitrix, portal);
        const dealFlow = new EventReportDealFlowService(bitrix, portal);
        const taskFlow = new EventReportTaskFlowService(
            bitrix,
            portal,
            await this.isTaskChecklistEnabled(dto.domain),
        );
        const kpiFlow = new EventReportKpiFlowService(bitrix, portal);
        const postFail = new EventReportPostFailService(bitrix, portal);
        const leadRelation = new EventReportLeadRelationService(bitrix, portal);
        const returnToTmc = new EventReportReturnToTmcService(bitrix, portal);
        const history = new EventReportEntityHistoryService(bitrix);

        // KPI использует тот же ColdHookBatchGroupBuffer (контракт KpiListFlowService).
        // По факту мы тут одна группа = весь endpoint; вся работа упадёт в один HTTP.
        const buffer = new ColdHookBatchGroupBuffer(bitrix);

        // Чек-лист ЗАКРЫВАЕМОЙ задачи читается ДО всех flow-сервисов:
        // его итог уезжает в историю карточки, а её собирает entity-flow —
        // первый в цепочке. Один прямой вызов, batch не трогается.
        await taskFlow.readClosingChecklist(ctx);

        // dealFlow сам выключается для leadOnly (ctx.isDealFlow), возврат в
        // ТМЦ — тоже про движение сделок, поэтому гейтится стратегией явно.
        entityFlow.queue(ctx);
        const deals = dealFlow.queue(ctx);
        taskFlow.queue(ctx, deals);
        // await: дедуп финалов/уникальных читает существующие элементы
        // прямыми вызовами (batch-аккумулятор не трогается — см. flowDedup).
        await kpiFlow.queue(ctx, deals, buffer);
        /*
         * Список «ОП Презентации» НЕ пишем: его ведёт легаси-хук
         * (Laravel), и там он работает — решение владельца 27.08.
         * Две записи об одной презентации из двух систем были бы
         * хуже отсутствия одной. Новый контур ведёт СМАРТ
         * «Презентации» (presentation-flow), он и заменит список.
         */
        postFail.queue(ctx);
        leadRelation.queue(ctx);
        if (ctx.strategy !== EEventReportFlowStrategy.LEAD_ONLY) {
            returnToTmc.queue(ctx);
        }
        history.queue(ctx);

        // Коммитим KPI группу + flush'им буфер. Также отправляем всё, что
        // напрямую закинули в bitrix.batch.* (entity/deal/task/etc.).
        await buffer.endGroup();
        await buffer.flush();
        const results = await bitrix.api.callBatchWithConcurrency(1);

        // Финал (продажа/отказ) двигает статусы связанных заявок/лидов и
        // дописывает историю обработки — отдельными волнами ПОСЛЕ основного
        // батча (multiple-история требует свежих значений лида).
        // Формат crm-значений (`to_sale_deal`) зависит от фактических
        // привязок поля на портале — читаем их (кэш 10 мин на домен),
        // иначе связь продажи молча не сохранится.
        const leadRequestSync = new EventReportLeadRequestSyncService(
            bitrix,
            portal,
            await this.leadLinkDefinitions(ctx.domain, bitrix, portal),
        );
        await leadRequestSync.run(ctx);

        // Перенос: сообщение ответственному — ПОСЛЕ основного батча
        // (im.notify не батчится), ошибка отправки гасится внутри и отчёт
        // не роняет (todo2508-02 №4б).
        await taskFlow.notifyTransfer(ctx);

        const commandsCount =
            results.reduce(
                (sum, chunk) => sum + Object.keys(chunk.result ?? {}).length,
                0,
            ) + buffer.getResults().length;

        // Сайд-flow ЗПР — отдельной очередью ПОСЛЕ основного: отчёт уже
        // «предварительно готов», элемент смарта доезжает асинхронно и не
        // удлиняет основной flow (решение владельца, 2508). Ошибка постановки
        // не роняет отчёт.
        // Ответы портальных анкет, адресованные элементам смартов:
        // каталог и выключатель читаются один раз на оба потока.
        const questionnaire = await this.loadQuestionnaireSmartContext(dto);

        await this.dispatchZprFlow(ctx, deals, questionnaire, socketId).catch(
            error =>
                this.logger.warn(
                    `zpr-flow не поставлен в очередь: ${(error as Error).message}`,
                ),
        );

        // Сайд-flow презентаций — тем же принципом: элемент смарта
        // «Презентации» (зеркало сделок «ОП Презентации») доезжает отдельной
        // очередью. Сами pres-сделки уже отработали в основном батче —
        // смарт их НЕ заменяет и не отменяет.
        await this.dispatchPresentationFlow(
            ctx,
            deals,
            questionnaire,
            socketId,
        ).catch(error =>
            this.logger.warn(
                `presentation-flow не поставлен в очередь: ${(error as Error).message}`,
            ),
        );

        this.logger.log(
            `event-report executed: entity=${ctx.entityType}:${ctx.entityId}, strategy=${ctx.strategy}, commands=${commandsCount}`,
        );
        return {
            success: true,
            commandsCount,
            entityType: ctx.entityType,
            entityId: ctx.entityId,
        };
    }

    /**
     * Джобы сайд-очереди ЗПР: отчёт по задаче «Решение» закрывает элемент,
     * план «Решения» создаёт новый — оба могут случиться в одном отчёте
     * (отчитались и запланировали следующий), тогда джобов два, в этом же
     * порядке. Не «Решение» — очередь не трогаем.
     */
    private async dispatchZprFlow(
        ctx: EventReportContext,
        deals: { baseDealId: string | null },
        questionnaire: QuestionnaireSmartContext | null,
        socketId?: string,
    ): Promise<void> {
        /*
         * Перенос (isExpired) — ОДИН джоб-move: задача та же, элемент тот же.
         * Пара report+plan здесь дала бы фантомное «не состоялся» плюс второй
         * открытый элемент (находка ревью).
         */
        const isMove = ctx.isExpired;
        const kinds: Array<'report' | 'plan'> = [];
        if (ctx.reportEventType === 'hot') kinds.push('report');
        if (!isMove && ctx.planEventType === 'hot' && ctx.isPlanned) {
            kinds.push('plan');
        }
        // Перенос план-only (без отчётного типа hot): двигаем по плану.
        if (isMove && !kinds.length && ctx.planEventType === 'hot') {
            kinds.push('report');
        }

        const answers = this.buildSmartAnswers(questionnaire, ZPR_SMART_KIND);
        this.warnOrphanAnswers(
            'zpr-flow',
            ctx,
            answers,
            coveredAnswerPurposes(kinds, isMove),
        );
        if (!kinds.length) return;

        // Ссылка `$result[...]` на создаваемую этим же отчётом сделку в джоб
        // не годится — batch уже отправлен, но числового id у нас нет.
        const numericBaseDealId = Number(
            ctx.currentBaseDeal?.ID ?? deals.baseDealId,
        );
        const baseDealId =
            Number.isFinite(numericBaseDealId) && numericBaseDealId > 0
                ? numericBaseDealId
                : null;

        const base: Omit<ZprFlowJobData, 'kind'> = {
            domain: ctx.domain,
            operationId: ctx.dto.operationId,
            socketId,
            baseDealId,
            presDealId: Number(ctx.currentPresDeal?.ID) || null,
            companyId:
                ctx.entityType === EEventReportEntityType.COMPANY
                    ? ctx.entityId
                    : Number(ctx.company?.ID) || null,
            leadId: Number(ctx.lead?.ID) || null,
            contactId:
                Number(
                    ctx.dto.plan?.contact?.ID ?? ctx.dto.report?.contact?.ID,
                ) || null,
            responsibleId: ctx.planResponsibleId,
            // Задача, по которой отчитываемся: элемент привяжется к ней в
            // UF_CRM_TASK (`T{hex}_{id}`) по завершении джоба.
            taskId: Number(ctx.currentTask?.id) || null,
            planDeadline: ctx.planDeadline?.toCrmDateTime() ?? null,
            planName: ctx.planEventName || null,
            planComment: ctx.reportComment || null,
            reportComment: ctx.reportComment || null,
            isResult: ctx.isResult,
            // Отказ (в т.ч. «не ЦА») закрывает звонок своей стадией.
            isFail: ctx.isFail || ctx.isNotCa,
            // Ответы портальной анкеты: пусто — поля нет вовсе, джоб
            // старой формы читается ровно так же.
            answers: answers.length ? answers : undefined,
        };

        for (const kind of kinds) {
            await this.queue.dispatch(
                QueueNames.EVENT_SALES_ZPR_FLOW,
                JobNames.EVENT_SALES_ZPR_FLOW,
                {
                    ...base,
                    kind,
                    isMove: kind === 'report' && isMove ? true : undefined,
                } satisfies ZprFlowJobData,
                this.sideJobId(ctx.dto.operationId, 'zpr', kind),
                { removeOnComplete: true, removeOnFail: true },
            );
        }
    }

    /**
     * Джобы сайд-очереди презентаций — зеркало dispatchZprFlow.
     *
     * Отчёт по презентации закрывает (или переносит) открытый элемент, план
     * презентации создаёт новый — оба могут случиться в одном отчёте
     * (отчитались и назначили следующую), тогда джобов два, и порядок
     * «сначала report, потом plan» обязателен: иначе новый элемент стал бы
     * «открытым» для собственного же отчёта.
     *
     * Спонтанная презентация (`isUnplannedPresentation`) тоже даёт report-джоб:
     * факт «презентация проведена» обязан фиксироваться всегда, даже когда
     * отчёт пришёл не по презентационной задаче.
     */
    private async dispatchPresentationFlow(
        ctx: EventReportContext,
        deals: { baseDealId: string | null },
        questionnaire: QuestionnaireSmartContext | null,
        socketId?: string,
    ): Promise<void> {
        // Отчёт «по презентации»: либо презентацию провели (в т.ч. спонтанно),
        // либо отчитались по презентационной задаче (перенос/срыв/отказ).
        const isPresentationReport =
            ctx.isPresentationDone || ctx.reportEventType === 'presentation';
        const kinds: Array<'report' | 'plan'> = [];
        if (isPresentationReport) kinds.push('report');
        /*
         * Перенос (isExpired) — задача та же, элемент тот же: report-джоб
         * двинет его в «Перенос» (outcome moved), а plan-джоб создал бы
         * ВТОРОЙ открытый элемент, и pending-элемент утёк бы навсегда
         * вместе со счётчиком переносов (находка ревью).
         */
        const isMove = ctx.isExpired && isPresentationReport;
        if (!isMove && ctx.planEventType === 'presentation' && ctx.isPlanned) {
            kinds.push('plan');
        }

        /*
         * Исход считаем ЗДЕСЬ, а не только в теле джоба: по нему поток
         * выбирает ветку «перенос или закрытие», а от неё зависит, чьи
         * ответы анкеты элемент унесёт. Флаг `isMove` выше для этого не
         * годится: «перенос + отказ» даёт исход `fail`, элемент
         * закрывается и плановую анкету не принимает.
         */
        const outcome = derivePresentationOutcome(ctx);
        const answers = this.buildSmartAnswers(
            questionnaire,
            PRESENTATION_SMART_KIND,
        );
        this.warnOrphanAnswers(
            'presentation-flow',
            ctx,
            answers,
            coveredAnswerPurposes(kinds, isPresentationMoveOutcome(outcome)),
        );
        if (!kinds.length) return;

        // Ссылка `$result[...]` на создаваемую этим же отчётом сделку в джоб
        // не годится — batch уже отправлен, но числового id у нас нет.
        const numericBaseDealId = Number(
            ctx.currentBaseDeal?.ID ?? deals.baseDealId,
        );
        const baseDealId =
            Number.isFinite(numericBaseDealId) && numericBaseDealId > 0
                ? numericBaseDealId
                : null;

        const base: Omit<PresentationFlowJobData, 'kind'> = {
            domain: ctx.domain,
            operationId: ctx.dto.operationId,
            socketId,
            outcome,
            isResult: ctx.isResult,
            isSpontaneous: ctx.isUnplannedPresentation,
            baseDealId,
            presDealId: Number(ctx.currentPresDeal?.ID) || null,
            /*
             * ТМЦ-сделка: из привязок задачи (`currentTmcDeal`), иначе —
             * найденная по обратной ссылке `UF_CRM_TO_PRESENTATION_SALES`
             * с pres-сделки. Оба пути дают сделку воронки `tmc_base`;
             * второй работает там, где задача к ТМЦ-сделке не привязана.
             */
            tmcDealId:
                Number(
                    ctx.currentTmcDeal?.ID ??
                        ctx.currentTmcFromPresentation?.ID,
                ) || null,
            companyId:
                ctx.entityType === EEventReportEntityType.COMPANY
                    ? ctx.entityId
                    : Number(ctx.company?.ID) || null,
            leadId: Number(ctx.lead?.ID) || null,
            contactId:
                Number(
                    ctx.dto.plan?.contact?.ID ?? ctx.dto.report?.contact?.ID,
                ) || null,
            responsibleId: ctx.planResponsibleId,
            taskId: Number(ctx.currentTask?.id) || null,
            planResponsibleId: ctx.planCreatedById || ctx.planResponsibleId,
            planDeadline: ctx.planDeadline?.toCrmDateTime() ?? null,
            planName: ctx.planEventName || null,
            planComment: ctx.reportComment || null,
            reportComment: ctx.reportComment || null,
            /*
             * Причина отказа — только та, что менеджер ДЕЙСТВИТЕЛЬНО выбрал:
             * геттер контекста отсекает дефолты селекта на нефинальных
             * отчётах, иначе элемент получал бы «Не было времени» на каждой
             * проведённой презентации.
             */
            failReasonCode: ctx.failReasonCode,
            // Снимок анкеты — из УЖЕ загруженных сущностей контекста, без
            // единого лишнего вызова Bitrix (фрейм пишет анкету до отчёта).
            survey: buildPresentationSurveySnapshot({
                portal: ctx.portal,
                lead: ctx.lead as Record<string, unknown> | null,
                baseDeal: ctx.currentBaseDeal as Record<string, unknown> | null,
            }),
            /*
             * Ответы ПОРТАЛЬНОЙ анкеты — рядом со снимком, а не вместо:
             * у снимка ключ это код нашего реестра полей, а здесь —
             * UF-имя произвольного поля портала. Слияние заставило бы
             * один из ключей врать.
             */
            answers: answers.length ? answers : undefined,
        };

        for (const kind of kinds) {
            await this.queue.dispatch(
                QueueNames.EVENT_SALES_PRESENTATION_FLOW,
                JobNames.EVENT_SALES_PRESENTATION_FLOW,
                { ...base, kind } satisfies PresentationFlowJobData,
                this.sideJobId(ctx.dto.operationId, 'pres', kind),
                { removeOnComplete: true, removeOnFail: true },
            );
        }
    }

    /**
     * Детерминированный id сайд-джоба — дешёвая защита от двойной
     * ПОСТАНОВКИ (повторный прогон основного отчёта, ретрай контроллера):
     * Bull молча не примет второй джоб с тем же id, пока первый в
     * очереди. Защита от повторной ДОСТАВКИ живёт в воркере
     * (SideFlowGuardService) — это разные беды.
     *
     * Нет operationId (легаси-клиент) — нет и id: поведение прежнее.
     */
    private sideJobId(
        operationId: string | undefined,
        flow: string,
        kind: 'plan' | 'report',
    ): string | undefined {
        return operationId ? `${operationId}:${flow}:${kind}` : undefined;
    }

    /**
     * Ответы анкеты для ОДНОГО смарта: снимок собирается по каталогу,
     * а не по payload — портал не должен уметь записать произвольное
     * поле произвольного смарта.
     */
    private buildSmartAnswers(
        questionnaire: QuestionnaireSmartContext | null,
        smartKind: string | undefined,
    ): QuestionnaireSmartAnswer[] {
        if (!questionnaire || !smartKind) return [];
        return buildQuestionnaireSmartAnswers({
            catalog: questionnaire.catalog,
            answers: questionnaire.answers,
            smartKind,
            disabledEventTypes: questionnaire.disabledEventTypes,
        });
    }

    /**
     * Ответы, которые НЕ ПОНЕСЁТ ни один джоб потока.
     *
     * Путей два, и молчать нельзя ни на одном. Первый: поток элемент не
     * трогает вовсе (сорванная презентация понижается до звонка уже во
     * фрейме) — джобов нет, сироты все ответы. Второй: джобы есть, а
     * анкету ОДНОГО назначения нести некому — плановую анкету показало
     * условие, не связанное с типом плана, а план-джоб отчёт не ставит.
     * Менеджер ответил, ответа нигде нет, и объяснить это было бы нечем.
     */
    private warnOrphanAnswers(
        flow: string,
        ctx: EventReportContext,
        answers: QuestionnaireSmartAnswer[],
        covered: ReadonlySet<QuestionnaireAnswerPurpose>,
    ): void {
        const orphans = answers.filter(answer => !covered.has(answer.purpose));
        if (!orphans.length) return;
        const purposes = [
            ...new Set(orphans.map(answer => answer.purpose)),
        ].join(', ');
        this.logger.warn(
            `[${flow}] ${ctx.domain}: анкету назначения «${purposes}» ` +
                `этим отчётом нести некому — ${orphans.length} ответ(ов) ` +
                `записать некуда: ` +
                orphans
                    .map(answer => `${answer.key}=${answer.value}`)
                    .join('; '),
        );
    }

    /**
     * Ответы, которые отбросил САМ снимок: кода нет в каталоге, анкету
     * погасил выключатель, ключ пришёл дважды.
     *
     * Раньше это был единственный путь потери ответа, о котором в логе не
     * было ни строки: снимок собирается по каталогу молча, и «куда делся
     * ответ» расследовать было нечем — а типовая причина как раз бытовая
     * (владелец правил анкету, пока менеджер её заполнял).
     *
     * Считается ОДИН раз на отчёт, до раскладки по потокам: «вопрос чужого
     * смарта» здесь не потеря (его несёт соседний поток), а два вызова
     * снимка удвоили бы каждую строку.
     */
    private warnLostAnswers(
        domain: string,
        questionnaire: QuestionnaireSmartContext,
    ): void {
        const losses = findLostQuestionnaireAnswers(questionnaire);
        if (!losses.length) return;
        this.logger.warn(
            `[questionnaire] ${domain}: ${losses.length} ответ(ов) анкеты ` +
                'в элемент смарта не уедут: ' +
                losses
                    .map(
                        loss =>
                            `${loss.key}${loss.title ? ` («${loss.title}»)` : ''}` +
                            ` — ${loss.reason}`,
                    )
                    .join('; '),
        );
    }

    /**
     * Каталог анкет + выключатель по типам события; null — ответов не
     * прислали (обычный случай) либо каталог недоступен.
     *
     * Горячий путь не трогаем: ни одного лишнего чтения, пока в отчёте
     * нет ни одного ответа портальной анкеты.
     */
    private async loadQuestionnaireSmartContext(
        dto: EventSalesFlowDto,
    ): Promise<QuestionnaireSmartContext | null> {
        const answers = dto.questionnaireAnswers ?? [];
        if (!answers.length) return null;

        try {
            const catalog = await this.questionnaires.resolve(
                dto.domain,
                EnumPortalAppCode.eventSales,
            );
            const context: QuestionnaireSmartContext = {
                catalog,
                answers,
                disabledEventTypes: await this.resolveDisabledEventTypes(
                    dto.domain,
                ),
            };
            this.warnLostAnswers(dto.domain, context);
            return context;
        } catch (error) {
            this.logger.warn(
                `каталог анкет ${dto.domain} недоступен ` +
                    `(${(error as Error).message}) — ${answers.length} ответ(ов) ` +
                    'в элемент смарта не уедут',
            );
            return null;
        }
    }

    /**
     * Типы события, для которых анкеты выключены настройками портала.
     *
     * Настройки недоступны — считаем, что выключателя нет: фрейм
     * анкету всё равно показал, менеджер на неё ответил, и терять
     * ответ из-за упавшего Redis хуже, чем записать его в элемент.
     */
    private async resolveDisabledEventTypes(domain: string): Promise<string[]> {
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            return parseQuestionnaireDisabledEventTypes(
                settings.questionnairesDisabledEventTypes,
            );
        } catch (error) {
            this.logger.warn(
                `настройки ${domain} недоступны — выключатель анкет ` +
                    `по типам события не применён (${(error as Error).message})`,
            );
            return [];
        }
    }

    /**
     * Гейт чек-листов задач (`task_checklist_enabled`, по умолчанию ВЫКЛ).
     *
     * Настройки недоступны — считаем выключенным: отчёт важнее чек-листа,
     * упавший сервис настроек не должен ни ронять отправку, ни включать
     * чек-листы неожиданно для владельца портала.
     */
    private async isTaskChecklistEnabled(domain: string): Promise<boolean> {
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            return Boolean(settings.withTaskChecklist);
        } catch (error) {
            this.logger.warn(
                `настройки ${domain} недоступны — чек-листы задач выключены ` +
                    `(${(error as Error).message})`,
            );
            return false;
        }
    }

    /**
     * Настройки классов поведения полей карточки.
     *
     * Настройки недоступны — работаем на дефолтах СХЕМЫ, а не выключаем
     * расчёт: в отличие от чек-листов (там включение меняет вид задач у
     * всех менеджеров, и «по умолчанию выключено» — осознанная страховка)
     * здесь дефолт схемы и есть штатное поведение, а упавший Redis не
     * повод возвращать заведомо врущие даты в карточку.
     */
    private async resolveFieldPolicySettings(
        domain: string,
    ): Promise<EventFieldPolicySettings> {
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            return {
                calculatedNextEvent: Boolean(settings.withCalculatedNextEvent),
                resetOnFinal: Boolean(settings.withFinalFieldsReset),
            };
        } catch (error) {
            this.logger.warn(
                `настройки ${domain} недоступны — политики полей на дефолтах ` +
                    `схемы (${(error as Error).message})`,
            );
            return DEFAULT_FIELD_POLICY_SETTINGS;
        }
    }

    /**
     * Определения полей-связей лида с портала: формат crm-значения зависит
     * от числа разрешённых типов (один → голый id, несколько → `D_123`).
     * Поле не установлено — не запрашиваем.
     */
    private async leadLinkDefinitions(
        domain: string,
        bitrix: BitrixService,
        portal: PortalModel,
    ): Promise<LeadUfDefinitions> {
        const names = [PBX_SALES_EVENT_FIELD_CODES.to_sale_deal]
            .map(code => {
                const field = portal.getEntityFieldByCode('lead', code);
                return field ? portal.getFieldBitrixId(field) : null;
            })
            .filter((name): name is string => !!name);
        return this.ufDefinitions.resolve(domain, bitrix, names);
    }
}
