import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx/pbx.service';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
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
    DEFAULT_STAGE_RULE_SETTINGS,
    EventFieldPolicySettings,
    EventStageRuleSettings,
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
import { EventReportPostFlowService } from '../services/post-flow/event-report-post-flow.service';

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
        // Гейт чек-листов задач: настройка портала (Redis-кэш 300 с).
        private readonly appSettings: PortalAppSettingsService,
        // Всё, что происходит ПОСЛЕ основного батча: анкеты, id план-задачи
        // из ответа батча и постановка сайд-очередей.
        private readonly postFlow: EventReportPostFlowService,
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
        ctx.setStageRuleSettings(
            await this.resolveStageRuleSettings(dto.domain),
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
        const kpiRows = await kpiFlow.queue(ctx, deals, buffer);
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

        // Коммитим KPI группу + flush'им буфер.
        //
        // ВАЖНО про источники ответа: cmdBatch ОДИН на инстанс Битрикса, и
        // `buffer.flush()` шлёт его целиком — вместе с командами, которые
        // flow-сервисы положили напрямую в `bitrix.batch.*` (в том числе
        // `add_task`). Поэтому хвостовой `callBatchWithConcurrency` почти
        // всегда работает на УЖЕ пустой очереди и возвращает []: ответы лежат
        // в `buffer.getResults()`. Он остаётся нужен для случая, когда буфер
        // пуст (flush — no-op) и всё уезжает только этим вызовом: KPI-команд
        // может не быть вовсе, и тогда весь cmdBatch уходит именно тут.
        // ОБА пути рабочие, и оба покрыты event-report-use-case-batch-seam.spec.
        await buffer.endGroup();
        await buffer.flush();
        const results = await bitrix.api.callBatchWithConcurrency(1);
        // Полный ответ батча = флаши буфера + хвостовой вызов. Координатор
        // сайд-очередей читает отсюда id созданной план-задачи, и взять
        // только `results` значило бы не найти её никогда.
        const batchResults = [...buffer.getResults(), ...results];

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

        // Считаем по СКЛЕЕННОМУ ответу — то есть по обоим источникам сразу.
        // Прежняя формула складывала число КОМАНД (reduce по `results`) с
        // числом ЧАНКОВ (`buffer.getResults().length`) — разные единицы, и на
        // штатном пути (`results` пуст, см. выше) наружу уезжала единица
        // вместо реального количества команд. DTO ответа при этом обещает
        // «сумму прямых команд и команд KPI-буфера» с примером 17 — то есть
        // контракт был верным, а реализация ему не соответствовала.
        const commandsCount = batchResults.reduce(
            (sum, chunk) => sum + Object.keys(chunk.result ?? {}).length,
            0,
        );

        // Сайд-flow (ЗПР и «Презентации») — отдельными очередями ПОСЛЕ
        // основного: отчёт уже «предварительно готов», элементы смартов
        // доезжают асинхронно и не удлиняют основной flow (решение владельца,
        // 2508). Сами pres-сделки уже отработали в основном батче — смарт их
        // НЕ заменяет и не отменяет. Постановкой (включая анкеты и id только
        // что созданной план-задачи, который читается из `batchResults` —
        // ответа того же батча, без единого лишнего запроса) занимается
        // координатор; его ошибки отчёт не роняют.
        // Внешний страховочный catch: внутри координатора каждый поток и
        // каждая постановка уже под своим catch'ем, но основной батч к этому
        // моменту ОТПРАВЛЕН — отчёт состоялся, и любая неучтённая ошибка
        // раскладки (например, отвалившийся клиент очереди) не имеет права
        // превратить успешный отчёт в ошибку для фронта. Ровно так же были
        // защищены оба прежних вызова dispatchZprFlow/dispatchPresentationFlow.
        await this.postFlow
            .dispatch({
                ctx,
                deals,
                batchResults,
                kpiRows,
                socketId,
            })
            .catch(error =>
                this.logger.warn(
                    `сайд-очереди не разложены: ${(error as Error).message}`,
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
     * Правила стадий основной воронки (`refine_stage_on_plan_enabled`).
     *
     * Настройки недоступны — дефолт СХЕМЫ (исключение выключено): лестница
     * ведёт себя как всегда, а не выбирает стадию по недочитанной настройке.
     */
    private async resolveStageRuleSettings(
        domain: string,
    ): Promise<EventStageRuleSettings> {
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            return {
                refineStageOnPlan: Boolean(settings.withRefineStageOnPlan),
            };
        } catch (error) {
            this.logger.warn(
                `настройки ${domain} недоступны — правила стадий на дефолтах ` +
                    `схемы (${(error as Error).message})`,
            );
            return DEFAULT_STAGE_RULE_SETTINGS;
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
