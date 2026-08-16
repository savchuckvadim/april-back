import { Injectable, Logger } from '@nestjs/common';
import { getErrorDetails } from '@/shared';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import {
    ISalesHookUseCase,
    SalesHookExecutionContext,
} from '../../core/contracts/sales-hook-use-case.contract';
import {
    ILeadToWorkItem,
    ResolvedLeadToWorkItem,
} from '../dto/lead-to-work.dto';
import {
    LeadToWorkItemResultDto,
    LeadToWorkResultDto,
} from '../dto/lead-to-work-result.dto';
import { LeadToWorkContextService } from '../services/lead-to-work-context.service';
import { LeadToWorkStageResolver } from '../services/lead-to-work-stage.resolver';
import {
    LeadToWorkAssigneeService,
    LeadToWorkAssigneeSource,
} from '../services/lead-to-work-assignee.service';
import {
    LeadToWorkFlowService,
    LeadToWorkQueuedPlan,
} from '../services/lead-to-work-flow.service';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { LeadUfDefinitionsService } from '../../../shared/portal-fields';
import { UserNameResolver } from '../../../shared/lead-request/user-name.resolver';
import { LeadToWorkNotifyService } from '../services/lead-to-work-notify.service';
import { LeadToWorkDuplicateCheckService } from '../services/lead-to-work-duplicate-check.service';
import { LeadToWorkTimelineService } from '../services/lead-to-work-timeline.service';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';

type BxRow = Record<string, unknown>;

/**
 * Хук «лид → работа» — не обнуляющее преобразование лида в работу ОП.
 *
 * ПОРЯДОК РАБОТЫ (по шагам, они же помечены в коде execute()):
 *
 *   Шаг 0. Создаём доменные сервисы на инстансе Битрикса ЭТОГО портала
 *          (ctx.bitrix). В поля класса их не кладём — @Injectable живёт
 *          в единственном экземпляре на все домены (CLAUDE.md).
 *   Шаг 1. Для КАЖДОГО лида пачки (кнопка = 1, робот = N):
 *     1.1  читаем состояние портала: сам лид, его компания, наша уже
 *          существующая сделка (обратная ссылка to_base_sales), сделки
 *          штатной конвертации, открытые задачи — 2 HTTP-волны;
 *     1.2  считаем целевые стадии: воронка/стадия сделки, стадия ХО,
 *          статус лида. Всё graceful: чего нет на портале — пропускаем
 *          с warning, кроме отсутствующей воронки ОП (это ошибка лида);
 *     1.3  ставим команды записи в ОДНУ группу буфера
 *          (company → deal → xo → lead → задачи) — они уедут одним
 *          HTTP-batch'ем, поэтому внутри работают ссылки $result[cmd];
 *     1.4  endGroup() закрывает группу этого лида: следующий лид пойдёт
 *          своей группой, ссылки между лидами не перепутаются;
 *     1.5  ошибка одного лида не валит пачку — пишем её в его warnings
 *          и продолжаем с остальными.
 *   Шаг 2. flush() отправляет накопленные группы в Битрикс. Делаем это
 *          ЗДЕСЬ, а не в runner'е, чтобы получить ответы команд: только
 *          после отправки становятся известны РЕАЛЬНЫЕ id созданных
 *          сущностей. Повторный flush() в runner'е будет no-op.
 *   Шаг 3. Разбираем ответы батча в плоскую карту `cmdKey → ответ`.
 *   Шаг 4. Сшиваем результат: план команд каждого лида + реальные id из
 *          карты → items[] с baseDealId/xoDealId/companyId и warnings.
 *
 * Доменная идемпотентность (шаг 1.1): повтор по тому же лиду доводит
 * связи существующей сделки (reuse), а не создаёт вторую.
 */
@Injectable()
export class LeadToWorkUseCase
    implements ISalesHookUseCase<ILeadToWorkItem, LeadToWorkResultDto>
{
    readonly hook = EnumSalesHookCode.LEAD_TO_WORK;
    private readonly logger = new Logger(LeadToWorkUseCase.name);

    constructor(
        private readonly assignee: LeadToWorkAssigneeService,
        private readonly ufDefinitions: LeadUfDefinitionsService,
        private readonly userNames: UserNameResolver,
        private readonly duplicateCheck: LeadToWorkDuplicateCheckService,
        private readonly appSettings: PortalAppSettingsService,
    ) {}

    /**
     * Кому заявка принадлежала ДО этого прогона — ему уйдёт уведомление
     * «работа ушла». Приоритет: сотрудник сам передал (кнопка) → исключён
     * SLA-передачей → текущий ответственный лида (робот переназначает).
     */
    private previousResponsibleOf(
        item: ILeadToWorkItem,
        lead: BxRow,
    ): number | null {
        if (item.transferredBy) return item.transferredBy;
        if (item.excludeResponsible) return item.excludeResponsible;
        const current = Number(lead.ASSIGNED_BY_ID);
        return Number.isFinite(current) && current > 0 ? current : null;
    }

    /** UF-имена полей-связей лида, для которых нужен фактический формат. */
    private leadLinkFieldNames(ctx: SalesHookExecutionContext): string[] {
        return [
            PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
            PBX_SALES_EVENT_FIELD_CODES.to_xo_sales,
        ]
            .map(code => {
                const field = ctx.portal.getEntityFieldByCode('lead', code);
                return field ? ctx.portal.getFieldBitrixId(field) : null;
            })
            .filter((name): name is string => !!name);
    }

    async execute(
        ctx: SalesHookExecutionContext,
        items: ILeadToWorkItem[],
    ): Promise<LeadToWorkResultDto> {
        // ── Шаг 0. Доменные сервисы на инстансе Битрикса этого портала.
        // Живут только внутри вызова: инстанс приходит в ctx, в this его
        // класть нельзя (race condition между доменами).
        const contextService = new LeadToWorkContextService(
            ctx.bitrix,
            ctx.portal,
        );
        /*
         * Фактические определения полей-связей лида (SETTINGS): от количества
         * разрешённых типов зависит формат значения — голый id либо `D_{id}`.
         * Читается ОДИН раз на пачку и кэшируется на домен (10 мин): формат
         * не угадываем, иначе Битрикс молча не сохранит связь.
         */
        const ufDefinitions = await this.ufDefinitions.resolve(
            ctx.domain,
            ctx.bitrix,
            this.leadLinkFieldNames(ctx),
        );
        /*
         * ── Предобработка пачки: ЧИТАЕМ портал по каждому лиду и только
         * потом считаем/пишем. Ответственный резолвится здесь же, потому что
         * при конвертации он берётся С ЛИДА (см. keepLeadResponsible) — до
         * чтения лида это неизвестно. Имена сотрудников резолвятся одним
         * запросом на всю пачку: история заявки должна читаться людьми
         * («ХО передан: Вадим Савчук → Иван Петров», а не «447 → 465»).
         */
        const prepared: {
            item: ILeadToWorkItem;
            leadContext?: Awaited<ReturnType<LeadToWorkContextService['load']>>;
            assignee?: Awaited<
                ReturnType<LeadToWorkAssigneeService['resolve']>
            >;
            error?: string;
        }[] = [];
        for (const item of items) {
            try {
                const leadContext = await contextService.load(item.leadId);
                const leadRow = leadContext.lead as unknown as BxRow;
                const assignee = await this.assignee.resolve(ctx.domain, item, {
                    leadResponsibleId: Number(leadRow.ASSIGNED_BY_ID) || null,
                    // ХО распределяет заявку по кругу, конвертация —
                    // переносит работу как есть, за текущим менеджером.
                    keepLeadResponsible: item.isXo !== 'Y',
                });
                prepared.push({ item, leadContext, assignee });
            } catch (error) {
                const { message } = getErrorDetails(error);
                this.logger.warn(
                    `lead-to-work: лид ${item.leadId} пропущен — ${message}`,
                );
                prepared.push({ item, error: message });
            }
        }
        const userNames = await this.userNames.resolve(
            ctx.domain,
            ctx.bitrix,
            prepared.flatMap(entry => [
                entry.assignee?.responsible ?? 0,
                entry.item.transferredBy ?? 0,
                entry.item.excludeResponsible ?? 0,
            ]),
        );

        const flowService = new LeadToWorkFlowService(
            ctx.bitrix,
            ctx.portal,
            ufDefinitions,
            userNames,
        );

        // Накопитель: что запланировали по каждому лиду. Реальные id
        // появятся только после отправки батча (шаг 2), поэтому пока
        // храним ключи команд (dealCmd/xoCmd/companyCmd) и найденное чтением.
        const queued: {
            item: ILeadToWorkItem;
            plan?: LeadToWorkQueuedPlan;
            companyId: number | null;
            existingDealId: number | null;
            existingXoDealId: number | null;
            responsible?: number;
            assigneeSource?: LeadToWorkAssigneeSource;
            /** Название лида — в текст персонального уведомления. */
            leadTitle?: string;
            /** Прежний ответственный (передача) — ему уходит «работа ушла». */
            previousResponsibleId?: number | null;
            error?: string;
            warnings: string[];
        }[] = [];

        // ── Шаг 1. Планируем запись по каждому лиду (данные уже прочитаны).
        for (const entry of prepared) {
            const { item, leadContext, assignee } = entry;
            try {
                if (!leadContext || !assignee) {
                    queued.push({
                        item,
                        companyId: null,
                        existingDealId: null,
                        existingXoDealId: null,
                        error: entry.error ?? 'Лид не прочитан',
                        warnings: [],
                    });
                    continue;
                }
                // 1.0 Ответственный: пришёл в хуке → он; конвертация →
                //     ответственный лида; ХО → round-robin из отдела продаж
                //     (намёк — item.department, курсор — в app-cache).
                if (!assignee.responsible) {
                    queued.push({
                        item,
                        companyId: null,
                        existingDealId: null,
                        existingXoDealId: null,
                        error: 'Не удалось определить ответственного (responsible не передан, отдел пуст/не найден)',
                        warnings: assignee.warnings,
                    });
                    continue;
                }
                const resolvedItem: ResolvedLeadToWorkItem = {
                    ...item,
                    responsible: assignee.responsible,
                };

                // 1.2 Считаем целевые стадии от ТЕКУЩЕГО статуса лида:
                //     зеркало стадии («Презентация» лида → sales_pres),
                //     статус лида, стадия ХО. Отсутствующее на портале
                //     превращается в warning, а не в падение.
                const resolver = new LeadToWorkStageResolver(
                    ctx.portal,
                ).withCurrentLeadStatus(
                    this.text((leadContext.lead as unknown as BxRow).STATUS_ID),
                );
                const stagePlan = resolver.resolve(
                    resolvedItem,
                    !!leadContext.company,
                    leadContext.isConverted,
                );

                // 1.3 Ставим команды записи в буфер. Пока НИЧЕГО не уходит
                //     в Битрикс — команды копятся, чтобы уехать одним
                //     батчем и уметь ссылаться друг на друга ($result).
                //     Инициатор операции идёт автором KPI-событий ХО-ветки.
                const plan = flowService.queue(
                    resolvedItem,
                    leadContext,
                    stagePlan,
                    ctx.buffer,
                    ctx.initiatorUserId ?? null,
                );

                // 1.4 Закрываем группу этого лида: гарантия, что все его
                //     команды попадут в один HTTP-batch (иначе ссылки
                //     $result[…] на соседние команды не разрешатся).
                await ctx.buffer.endGroup();

                queued.push({
                    item,
                    plan,
                    companyId: leadContext.company
                        ? Number(leadContext.company.ID)
                        : null,
                    existingDealId: leadContext.existingOurDeal
                        ? Number(leadContext.existingOurDeal.ID)
                        : null,
                    existingXoDealId: leadContext.existingXoDeal
                        ? Number(leadContext.existingXoDeal.ID)
                        : null,
                    responsible: assignee.responsible,
                    assigneeSource: assignee.source,
                    leadTitle:
                        this.text(
                            (leadContext.lead as unknown as BxRow).TITLE,
                        ) ?? undefined,
                    previousResponsibleId: this.previousResponsibleOf(
                        item,
                        leadContext.lead as unknown as BxRow,
                    ),
                    warnings: [
                        ...assignee.warnings,
                        ...leadContext.warnings,
                        ...stagePlan.warnings,
                        ...plan.warnings,
                    ],
                });
            } catch (error) {
                // 1.5 Ошибка одного лида не валит пачку: записываем её в
                //     его результат и идём к следующему (робот мог прислать
                //     10 лидов, из которых один удалён на портале).
                const { message } = getErrorDetails(error);
                this.logger.warn(
                    `lead-to-work: лид ${item.leadId} пропущен — ${message}`,
                );
                queued.push({
                    item,
                    companyId: null,
                    existingDealId: null,
                    existingXoDealId: null,
                    error: message,
                    warnings: [],
                });
            }
        }

        // ── Шаг 2. Отправляем накопленные группы в Битрикс. Именно здесь,
        // а не в runner'е: только после отправки известны реальные id
        // созданных сущностей, а их надо вернуть клиенту.
        await ctx.buffer.flush();

        // ── Шаг 3. Ответы батча → плоская карта `cmdKey → ответ`.
        const byCmd = this.flattenResults(ctx.buffer.getResults());

        /*
         * Шаг 3.5. Персональные уведомления — ПОСЛЕ записи: назначение уже
         * состоялось, и сообщение не соврёт. Новому — «вам назначена
         * заявка» (с требованием подтвердить в ХО-ветке), прежнему — почему
         * работа ушла. Падение уведомления не роняет операцию.
         */
        const notifier = new LeadToWorkNotifyService(ctx.bitrix);
        for (const entry of queued) {
            if (entry.error || !entry.responsible) continue;
            const warnings = await notifier.notifyAssignment({
                domain: ctx.domain,
                leadId: entry.item.leadId,
                leadTitle: entry.leadTitle ?? `Лид ${entry.item.leadId}`,
                responsibleId: entry.responsible,
                previousResponsibleId: entry.previousResponsibleId ?? null,
                transferredById: entry.item.transferredBy ?? null,
                requiresAccept: entry.item.isXo === 'Y',
            });
            entry.warnings.push(...warnings);
        }

        /*
         * Шаг 3.6. Дубли на входе: увидеть «клиента уже ведут» надо ДО
         * первого звонка менеджера, а руками кнопку никто не жмёт. Ставим
         * проверку в очередь (не блокируя ответ) только по входящим
         * заявкам и только если по лиду её ещё не было — гейт внутри
         * сервиса. Выключено по умолчанию, включается настройкой портала.
         */
        const dupWarnings = await this.duplicateCheck.queueForLeads(
            ctx.domain,
            ctx.portal,
            prepared
                .filter(entry => entry.leadContext && !entry.error)
                .map(entry => ({
                    leadId: entry.item.leadId,
                    leadRow: entry.leadContext!.lead as unknown as BxRow,
                    isIncoming: entry.item.isXo === 'Y',
                })),
        );
        if (dupWarnings.length && queued.length) {
            queued[0].warnings.push(...dupWarnings);
        }

        // ── Шаг 4. Сшиваем план каждого лида с реальными id из ответов.
        const results = queued.map(entry => this.toItemResult(entry, byCmd));

        /*
         * Шаг 4.5. Прошлое заявки — в сделку: комментарий со ссылкой на лид
         * и привязка дел таймлайна (письма, звонки). Только ЗДЕСЬ, потому
         * что нужен реальный id сделки — до flush его не существует.
         */
        const timelineWarnings = await this.transferTimeline(
            ctx,
            results,
            queued,
        );
        if (timelineWarnings.length && results.length) {
            results[0].warnings.push(...timelineWarnings);
        }

        const created = results.filter(
            r => r.baseDealId && !r.reused && !r.warnings.includes('__failed'),
        ).length;
        const reused = results.filter(r => r.reused).length;

        return {
            implemented: true,
            items: results,
            leadIds: items.map(item => item.leadId),
            message: `Преобразовано лидов: ${results.length} (создано сделок: ${created}, reuse: ${reused}).`,
        };
    }

    /**
     * Шаг 4.5: прошлое заявки — в сделку (комментарий-ссылка + привязка дел
     * таймлайна). Настройками портала выключается целиком; ошибки уходят в
     * warnings — работа уже создана, и таймлайн её не отменяет.
     */
    private async transferTimeline(
        ctx: SalesHookExecutionContext,
        results: LeadToWorkItemResultDto[],
        queued: { item: ILeadToWorkItem; leadTitle?: string }[],
    ): Promise<string[]> {
        const settings = await this.appSettings.resolve(
            ctx.domain,
            EnumPortalAppCode.eventSales,
        );
        if (
            !settings.leadWorkCopyActivities &&
            !settings.leadWorkOriginComment
        ) {
            return [];
        }

        const titles = new Map(
            queued.map(entry => [entry.item.leadId, entry.leadTitle ?? '']),
        );
        const transfers = results
            .filter(item => !!item.baseDealId)
            .map(item => ({
                leadId: item.leadId,
                leadTitle: titles.get(item.leadId) ?? '',
                dealId: Number(item.baseDealId),
                reused: item.reused,
            }));
        if (!transfers.length) return [];

        return new LeadToWorkTimelineService(ctx.bitrix, ctx.domain).run(
            transfers,
            {
                copyActivities: settings.leadWorkCopyActivities,
                activitiesLimit: settings.leadWorkCopyActivitiesLimit,
                writeOriginComment: settings.leadWorkOriginComment,
            },
        );
    }

    /**
     * Шаг 4 для одного лида: план команд + карта ответов → итог для клиента.
     *
     * Приоритет id: сначала то, что ПРОЧИТАЛИ до записи (существующая
     * сделка при reuse, компания лида), потом то, что СОЗДАЛИ (ответ
     * команды по её cmdKey). Если команды не было — в поле null.
     */
    private toItemResult(
        entry: {
            item: ILeadToWorkItem;
            plan?: LeadToWorkQueuedPlan;
            companyId: number | null;
            existingDealId: number | null;
            existingXoDealId: number | null;
            responsible?: number;
            assigneeSource?: LeadToWorkAssigneeSource;
            error?: string;
            warnings: string[];
        },
        byCmd: Map<string, unknown>,
    ): LeadToWorkItemResultDto {
        const { item, plan } = entry;
        const warnings = [...entry.warnings];
        if (entry.error) {
            warnings.push(`Ошибка: ${entry.error}`);
        }

        const idOf = (cmd?: string): number | null => {
            if (!cmd) return null;
            return this.entityIdOf(byCmd.get(cmd));
        };

        return {
            leadId: item.leadId,
            reused: plan?.reused ?? false,
            baseDealId: entry.existingDealId ?? idOf(plan?.dealCmd),
            // Повторный ХО обновляет СУЩЕСТВУЮЩУЮ ХО-сделку — её id известен
            // из чтения (to_xo_sales), ответ deal.update его не содержит.
            xoDealId: entry.existingXoDealId ?? idOf(plan?.xoCmd),
            companyId: entry.companyId ?? idOf(plan?.companyCmd),
            tasksMoved: plan?.tasksMoved ?? 0,
            tasksClosed: plan?.tasksClosed ?? 0,
            taskCreated: !!plan?.taskAddCmd,
            responsible: entry.responsible ?? null,
            assigneeSource: entry.assigneeSource ?? null,
            isRequest: plan?.isRequest ?? false,
            kpiPlanned: plan?.kpiPlanned ?? false,
            kpiNotHeld: plan?.kpiNotHeld ?? false,
            warnings,
        };
    }

    /**
     * Шаг 3: батч возвращает массив чанков, в каждом — словарь
     * `cmdKey → ответ команды`. Схлопываем в одну карту, чтобы искать
     * ответ по ключу команды, который мы сами задали при постановке.
     */
    private flattenResults(
        chunks: { result?: Record<string, unknown> }[],
    ): Map<string, unknown> {
        const byCmd = new Map<string, unknown>();
        for (const chunk of chunks) {
            for (const [cmd, value] of Object.entries(chunk.result ?? {})) {
                byCmd.set(cmd, value);
            }
        }
        return byCmd;
    }

    /**
     * id из ответа команды. Битрикс отвечает по-разному: crm.*.add — голым
     * числом, tasks.task.add — объектом `{task: {id}}`, иногда строкой.
     */
    private entityIdOf(raw: unknown): number | null {
        if (raw == null) return null;
        if (typeof raw === 'number') return raw;
        if (typeof raw === 'string') {
            const value = Number(raw);
            return Number.isFinite(value) && value > 0 ? value : null;
        }
        if (typeof raw === 'object') {
            const task = (raw as { task?: { id?: unknown } }).task;
            if (task) return this.entityIdOf(task.id);
        }
        return null;
    }

    private text(raw: unknown): string | null {
        if (typeof raw === 'string') return raw.trim() || null;
        if (typeof raw === 'number') return String(raw);
        return null;
    }
}
