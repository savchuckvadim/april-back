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
import {
    LeadToWorkIntentResolution,
    resolveLeadToWorkIntent,
} from '../lib/lead-to-work-intent';
import { LeadRequestDetectorService } from '../services/lead-request-detector.service';
import { LEAD_WORK_KIND } from '../../../shared/event-title';
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
import { LeadDealCompletion } from '../../../shared/lead-client/lead-deal-completion';
import { LeadClientKind } from '../../../shared/lead-client';
import { PortalWorkingHoursService } from '../../../shared/working-hours/portal-working-hours.service';
import { shiftDeadlineToWorkingHours } from '../../../shared/working-hours/working-hours.model';
import { LeadToWorkTimelineService } from '../services/lead-to-work-timeline.service';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';

type BxRow = Record<string, unknown>;

/**
 * Через сколько суток звонить, если срок не прислали. Столько же ставит
 * формула роботов (`dateadd(Now,"1d")`) — держим одинаково, чтобы заявки с
 * присланным сроком и без него вели себя одинаково.
 */
const AUTO_DEADLINE_DAYS = 1;

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
        /** График портала — чтобы срок задачи не попадал в ночь и выходные. */
        private readonly workingHours: PortalWorkingHoursService,
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
            /** Намерение после слияния «запрос + карточка». */
            resolution?: LeadToWorkIntentResolution;
            error?: string;
        }[] = [];
        const detector = new LeadRequestDetectorService(ctx.portal);
        /*
         * Сами лиды пачки — ОДНИМ батчем. Волна 1 контекста иначе делает
         * свой HTTP на каждый лид, и на массовом переносе она и есть
         * потолок скорости (замер 15.09: ~1,7 с на запрос).
         */
        const contexts = await contextService.loadMany(
            items.map(entry => entry.leadId),
            items.some(entry => entry.taskAnyGroup === 'Y'),
        );
        for (const item of items) {
            try {
                const loaded = contexts.get(item.leadId);
                if (loaded instanceof Error) throw loaded;
                if (!loaded) {
                    throw new Error(`Лид ${item.leadId} не прочитан`);
                }
                const leadContext = loaded;
                const leadRow = leadContext.lead as unknown as BxRow;
                /*
                 * Намерение резолвим ДО выбора ответственного: от isXo
                 * зависит keepLeadResponsible, а isXo теперь может прийти
                 * не из запроса, а из поля карточки.
                 *
                 * Подтверждением заявки служит kind === 'request', а НЕ
                 * detection.isRequest: тот включает и входящее обращение
                 * (звонок/письмо/чат), а такой клиент заявки не оставлял и
                 * в начало воронки продаж уезжать не должен.
                 */
                const resolution = resolveLeadToWorkIntent({
                    item,
                    leadRow,
                    portal: ctx.portal,
                    isSiteRequest:
                        detector.detect(leadRow).kind ===
                        LEAD_WORK_KIND.request,
                });
                const assignee = await this.assignee.resolve(
                    ctx.domain,
                    // Именно слитый элемент: responsible и department могли
                    // прийти не из запроса, а из полей карточки.
                    resolution.item,
                    {
                        leadResponsibleId:
                            Number(leadRow.ASSIGNED_BY_ID) || null,
                        // ХО распределяет заявку по кругу, конвертация —
                        // переносит работу как есть, за текущим менеджером.
                        keepLeadResponsible: resolution.intent.isXo !== 'Y',
                    },
                );
                prepared.push({
                    item: resolution.item,
                    leadContext,
                    assignee,
                    resolution,
                });
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
            const { item, leadContext, assignee, resolution } = entry;
            try {
                if (!leadContext || !assignee || !resolution) {
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
                    ...resolution.intent,
                    responsible: assignee.responsible,
                    // Названный явно сотрудник = адресный ХО = заявка принята.
                    addressed:
                        resolution.intent.isXo === 'Y' &&
                        assignee.source === 'explicit',
                    deadline: await this.workingDeadline(
                        ctx,
                        item.deadline ??
                            this.autoDeadline(assignee.source, item),
                    ),
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

        // ── Шаг 4. Сшиваем план каждого лида с реальными id из ответов.
        const results = queued.map(entry => this.toItemResult(entry, byCmd));

        /*
         * Шаг 4.1. Дубли на входе: увидеть «клиента уже ведут» надо ДО
         * первого звонка менеджера, а руками кнопку никто не жмёт. Ставим
         * проверку в очередь (не блокируя ответ) только по входящим
         * заявкам и только если по лиду её ещё не было — гейт внутри
         * сервиса. Выключено по умолчанию, включается настройкой портала.
         * После шага 4 — чтобы итог ушёл и в таймлайн созданной сделки.
         */
        const dealIdOf = new Map(
            results.map(result => [result.leadId, result.baseDealId]),
        );
        const dupWarnings = await this.duplicateCheck.queueForLeads(
            ctx.domain,
            ctx.portal,
            prepared
                .filter(entry => entry.leadContext && !entry.error)
                .map(entry => ({
                    leadId: entry.item.leadId,
                    leadRow: entry.leadContext!.lead as unknown as BxRow,
                    isIncoming: entry.item.isXo === 'Y',
                    dealId: dealIdOf.get(entry.item.leadId) ?? null,
                })),
        );
        if (dupWarnings.length && results.length) {
            results[0].warnings.push(...dupWarnings);
        }

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

        /*
         * Шаг 4.6. Клиент и данные заявки — в сделку: контакт или компания
         * из голого лида, поля заявки, ИНН, карточка в таймлайне. Тем же
         * кодом, которым идёт перегон прошлого, — иначе конвертация у
         * клиента и перегон давали бы разный результат.
         */
        const enrichWarnings = await this.enrichDeals(ctx, results, items);
        if (enrichWarnings.length && results.length) {
            results[0].warnings.push(...enrichWarnings);
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
    /**
     * Срок задачи, приведённый к рабочему времени портала.
     *
     * Роботы Битрикса ставят срок формулой «ровно через сутки»
     * (`dateadd(Now, "1d")`), и заявка, упавшая в четыре утра, давала задачу
     * на четыре утра — наблюдалось 17.09.2026. Формула про календарь портала
     * не знает, а мы знаем: срок в рабочем времени остаётся как есть, ночь и
     * выходные переезжают на начало ближайшего рабочего дня.
     *
     * График не прочитан — возвращаем как пришло: своё расписание лучше
     * чужого молчания, но падать из-за календаря конвертация не должна.
     */
    /**
     * Срок, когда его не прислали.
     *
     * Решение владельца 18.09.2026: раз сотрудника выбирает круг, то и срок
     * назначаем мы сами — «сутки от сейчас», а `workingDeadline` ниже
     * подвинет его в рабочие часы портала. Раньше такая заявка уходила с
     * задачей БЕЗ срока: её не видно ни в списке «на сегодня», ни в
     * просрочке.
     *
     * Только для круга: если сотрудника назвали явно (кнопка, адресный ХО),
     * человек сам решает, когда звонить, и выдумывать за него срок нельзя.
     */
    private autoDeadline(
        source: LeadToWorkAssigneeSource,
        item: ILeadToWorkItem,
    ): string | undefined {
        if (source !== 'round-robin' || item.isXo !== 'Y') return undefined;
        const next = new Date();
        next.setDate(next.getDate() + AUTO_DEADLINE_DAYS);
        return next.toISOString();
    }

    private async workingDeadline(
        ctx: SalesHookExecutionContext,
        deadline: string | undefined,
    ): Promise<string | undefined> {
        if (!deadline) return deadline;
        const { domain } = ctx;
        try {
            const { hours } = await this.workingHours.resolve(domain);
            /*
             * Срок разбирается в ОБЕИХ формах — ISO из запроса и
             * «23.09.2026 05:41:32» из карточки лида. Раньше здесь стоял
             * `new Date`, который вторую форму не читает и молча оставлял
             * ночной срок ночным (сделка 84763, 22.09.2026).
             */
            const moved = shiftDeadlineToWorkingHours(
                deadline,
                hours,
                ctx.portal.getTimezone(),
            );
            if (moved === null) {
                this.logger.warn(
                    `[deadline] ${domain}: срок «${deadline}» не распознан — оставлен как есть`,
                );
                return deadline;
            }
            if (moved !== deadline) {
                this.logger.log(
                    `[deadline] ${domain}: срок ${deadline} вне рабочего времени — перенесён на ${moved}`,
                );
            }
            return moved;
        } catch (error) {
            this.logger.warn(
                `[deadline] ${domain}: график не прочитан (${(error as Error).message}) — ` +
                    'срок оставлен как есть',
            );
            return deadline;
        }
    }

    /**
     * Достройка созданных сделок: клиент из голого лида (контакт или
     * компания — по настройкам портала), затем данные заявки.
     *
     * Ошибка здесь НЕ роняет конвертацию: сделка уже создана, работа
     * менеджеру передана, а недостающий клиент или ИНН — повод для
     * предупреждения, а не для отката.
     */
    private async enrichDeals(
        ctx: SalesHookExecutionContext,
        results: readonly LeadToWorkItemResultDto[],
        items: readonly ILeadToWorkItem[],
    ): Promise<string[]> {
        const warnings: string[] = [];
        const settings = await this.appSettings.resolve(
            ctx.domain,
            EnumPortalAppCode.eventSales,
        );
        const completion = new LeadDealCompletion(
            ctx.bitrix,
            ctx.portal,
            ctx.domain,
            {
                linkClient: settings.leadWorkLinkClient,
                companyDepartmentIds: settings.leadClientCompanyDepartmentIds,
                activitiesLimit: settings.leadWorkCopyActivitiesLimit,
            },
        );
        /*
         * КЛИЕНТ ИЗ ЛИДА ПО ФЛАГУ ВЫЗОВА.
         *
         * `needConvertTo`: company — компания, contact — человек, nothing —
         * не создавать ничего даже при включённой настройке портала. Флага
         * нет — решает портал (`createCompany=Y` старых роботов означает
         * компанию). Клиент привязывается к лиду родной связью Битрикса:
         * телефоны и почта уезжают в него сами. Второй такой же клиент не
         * создаётся, а лид не закрывается — закрытие живёт в другом месте.
         */
        const kindOf = new Map<number, LeadClientKind | 'none' | undefined>(
            items.map(item => [
                item.leadId,
                item.needConvertTo === 'nothing'
                    ? 'none'
                    : (item.needConvertTo ??
                      (item.createCompany === 'Y' ? 'company' : undefined)),
            ]),
        );
        for (const result of results) {
            const dealId = Number(result.baseDealId);
            if (!Number.isFinite(dealId) || dealId <= 0) continue;
            try {
                const outcome = await completion.complete(
                    dealId,
                    [result.leadId],
                    { kind: kindOf.get(result.leadId) },
                );
                warnings.push(...outcome.warnings);
            } catch (error) {
                warnings.push(
                    `Сделка ${dealId}: данные заявки не перенесены — ${(error as Error).message}`,
                );
            }
        }
        return warnings;
    }

    private async transferTimeline(
        ctx: SalesHookExecutionContext,
        results: LeadToWorkItemResultDto[],
        queued: { item: ILeadToWorkItem; leadTitle?: string }[],
    ): Promise<string[]> {
        const settings = await this.appSettings.resolve(
            ctx.domain,
            EnumPortalAppCode.eventSales,
        );
        /*
         * Флаг элемента перебивает портальную настройку: массовый перенос
         * включает дела только рабочим волнам, а настройка портала одна на
         * всё. Флага нет (робот, кнопка) — поведение прежнее.
         */
        const itemCopyFlag = queued.find(
            entry => entry.item.copyActivities !== undefined,
        )?.item.copyActivities;
        const copyActivities =
            itemCopyFlag !== undefined
                ? itemCopyFlag === 'Y'
                : settings.leadWorkCopyActivities;

        const copyComments =
            queued.find(entry => entry.item.copyComments !== undefined)?.item
                .copyComments === 'Y';

        if (
            !copyActivities &&
            !copyComments &&
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
                copyActivities,
                activitiesLimit: settings.leadWorkCopyActivitiesLimit,
                writeOriginComment: settings.leadWorkOriginComment,
                copyComments,
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
