import { Injectable, Logger } from '@nestjs/common';
import {
    BitrixService,
    IBXCompany,
    IBXContact,
    IBXDeal,
    IBXLead,
} from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { EventSalesFlowDto } from '../../dto/event-sale-flow/event-sales-flow.dto';
import {
    DEAL_REFINE_FIELD_CODES,
    XVOST_DEAL_FIELD_CODES,
} from '../entity/event-report-entity-fields.model';
import { COMPANY_BACKFILL_CODES } from '../entity/event-report-company-backfill.model';
import {
    EEventReportEntityType,
    EventReportEntityType,
    IEventReportInitContext,
} from './event-report-init.types';

/** SELECT сделок init-батча (общий для list_deals и list_deals_by_lead). */
const DEAL_LIST_SELECT = [
    'ID',
    'TITLE',
    'CATEGORY_ID',
    'STAGE_ID',
    'CLOSED',
    'COMPANY_ID',
    'CONTACT_ID',
    'LEAD_ID',
    'ASSIGNED_BY_ID',
    'UF_CRM_TO_BASE_SALES',
    'UF_CRM_TO_PRESENTATION_SALES',
    'UF_CRM_TO_BASE_TMC',
];

/**
 * Поля сделки, которые event-report ЧИТАЕТ, чтобы дописать к прошлому
 * значению (`EventReportEntityFieldsModel`): счётчик презентаций и три
 * накопительных multiple-поля.
 *
 * Их ОБЯЗАТЕЛЬНО добавлять в select: `crm.deal.list` возвращает ровно то,
 * что попросили, а модель делает read-modify-write. Без них прочитанное
 * значение — пустое, и запись не дописывает, а ЗАТИРАЕТ: `pres_count`
 * навсегда оставался 1 (не копился ни на основной сделке, ни дальше), а
 * история и комментарии сделки схлопывались до одной последней строки.
 *
 * Имена берём из слепка портала (`UF_CRM_{bitrixId}`), а не хардкодом:
 * bitrixId полей задаёт установка портала.
 */
const DEAL_ACCUMULATED_FIELD_CODES = [
    'pres_count',
    'pres_comments',
    'op_fail_comments',
    'op_mhistory',
    // Счётчик переносов (todo2508-02 №6): DealMoveCountService пишет
    // «текущее + 1» из слепка — без чтения инкремент вечно давал бы 1.
    'op_move_count',
] as const;

/**
 * Коды pbx-полей сделки со связанными лидами (тот же набор, что в
 * pbx-duplicate/related-entities): стандартный LEAD_ID читается всегда,
 * эти — по слепку портала, когда проинсталлены.
 */
const DEAL_LEAD_LINK_FIELD_CODES = [
    'deal_from_lead_id',
    'deal_joined_leads',
    'op_smart_lid',
    'op_smart_lids',
] as const;

/** UF-ключи to_*-ссылок владельца на сделки других воронок (install-конвенция). */
const OWNER_DEAL_LINK_KEYS = [
    'UF_CRM_TO_BASE_SALES',
    'UF_CRM_TO_XO_SALES',
    'UF_CRM_TO_PRESENTATION_SALES',
    'UF_CRM_TO_BASE_TMC',
] as const;

/**
 * Select чтения сделок init-батча: базовый набор + UF-поля, которые flow
 * потом ЧИТАЕТ со сделок. `crm.deal.list` возвращает ровно то, что попросили,
 * поэтому каждый читатель обязан быть здесь представлен:
 *  - {@link DEAL_ACCUMULATED_FIELD_CODES} — read-modify-write накопительных
 *    полей (без чтения запись затирает историю);
 *  - {@link XVOST_DEAL_FIELD_CODES} — снимок deal-only «Хвоста» с базовой
 *    сделки в pres-сделку (`copyXvostSnapshot`): без select значения с
 *    базовой не приезжали, и снимок был вечно пуст;
 *  - {@link COMPANY_BACKFILL_CODES} — бэкфилл пустых полей компании со
 *    сделки (`EventReportCompanyBackfillModel`): без select сделка выглядела
 *    пустой, и бэкфилл никогда не срабатывал;
 *  - {@link DEAL_REFINE_FIELD_CODES} — состояние «на доработке» (read-
 *    modify-write: без чтения дата входа перештамповывалась бы каждым
 *    планом, а «уже на доработке» не отличалось бы от входа) и возражения
 *    как источник причины. Побочно возражение со сделки из списка начинает
 *    видеть и зеркало контакта — `sameValue` защищает от спама.
 *
 * Компании select не нужен: она читается `crm.company.get`, который отдаёт
 * ВСЕ поля (включая UF_*) — параметра select у метода нет вовсе.
 *
 * Имена резолвятся по слепку портала (`UF_CRM_{bitrixId}`), не хардкодом;
 * неустановленное поле просто не попадает в select (graceful — как и везде
 * в event-report). Экспортирована как чистая функция — на состав select
 * есть тесты (event-report-init-select.spec).
 */
export const buildDealListSelect = (portal: PortalModel): string[] => {
    const resolved = [
        ...DEAL_ACCUMULATED_FIELD_CODES,
        ...XVOST_DEAL_FIELD_CODES,
        ...COMPANY_BACKFILL_CODES,
        ...DEAL_REFINE_FIELD_CODES,
    ]
        .map(code => {
            const field = portal.getEntityFieldByCode('deal', code);
            return field?.bitrixId ? `UF_CRM_${field.bitrixId}` : null;
        })
        .filter((name): name is string => !!name);
    return [...new Set([...DEAL_LIST_SELECT, ...resolved])];
};

/**
 * Загружает все нужные event-report flow сущности одним HTTP-batch:
 *  - company (по entityId компании),
 *  - все её активные deals по 4 категориям,
 *  - lead (если связан),
 *  - currentTask (если был отчёт по задаче),
 *  - tmcDeal через UF_CRM_TO_PRESENTATION_SALES (для синхронизации с pres).
 *
 * Возвращает {@link IEventReportInitContext} — снимок состояния, на котором
 * дальше работает {@link EventReportContext} (вычисляет флаги).
 *
 * NB: @Injectable, но не держит `this.bitrix` — инстанс передаётся параметром
 * (см. CLAUDE.md race condition).
 */
@Injectable()
export class EventReportInitService {
    private readonly logger = new Logger(EventReportInitService.name);

    async loadContext(
        dto: EventSalesFlowDto,
        bitrix: BitrixService,
        portal: PortalModel,
    ): Promise<IEventReportInitContext> {
        const { entityId, entityType } = this.resolveEntity(dto);
        if (!entityId) {
            throw new Error(
                'EventReportInit: cannot resolve entityId from context/placement/lead',
            );
        }

        // Сделка запуска читается ДО общего батча: из её полей строится
        // остальная загрузка — лиды (LEAD_ID + deal_from_lead_id +
        // deal_joined_leads), связанные воронки (to_*-ссылки) и сделки тех
        // же лидов (там живёт ХО без компании).
        //
        // Читаем её и при якоре-компании (context.dealId): наследование
        // L_*-привязок в новую задачу и sync заявок берут рёбра из
        // ctx.ownerDeal — без этого лид сделки терялся, как только у
        // клиента появлялась компания и она становилась якорем.
        const launchDealId =
            entityType === EEventReportEntityType.DEAL
                ? entityId
                : this.toId(dto.context?.dealId);
        const ownerDeal = launchDealId
            ? await this.fetchOwnerDeal(bitrix, launchDealId)
            : null;
        const ownerLeadIds = this.collectOwnerLeadIds(ownerDeal, portal);

        const dtoLeadId = dto.lead?.ID ? Number(dto.lead.ID) : null;
        // Select один на все чтения сделок: накопительные поля обязаны
        // приехать, иначе запись их затрёт (см. DEAL_ACCUMULATED_FIELD_CODES).
        const dealSelect = this.dealListSelect(portal);

        // === Фаза 1: владелец (company/lead/deal) + active deals + task + DTO lead ===
        if (entityType === EEventReportEntityType.COMPANY) {
            bitrix.batch.company.get('get_company', entityId);
            this.queueActiveDealsLoad(bitrix, entityId, entityType, dealSelect);
        } else if (entityType === EEventReportEntityType.DEAL) {
            // У владельца-сделки нет «всех сделок компании» — добираем по
            // D_-ссылкам задачи (pres/tmc), to_*-ссылкам самой сделки и по
            // общим лидам, иначе отчёт создал бы дубли вместо обновления.
            this.queueActiveDealsLoad(
                bitrix,
                entityId,
                entityType,
                dealSelect,
                [
                    ...this.extractTaskDealIds(dto),
                    ...this.collectOwnerLinkedDealIds(ownerDeal),
                ],
            );
            if (ownerLeadIds.length) {
                bitrix.batch.deal.getList(
                    'list_deals_by_lead',
                    { LEAD_ID: ownerLeadIds } as never,
                    dealSelect,
                );
            }
            const primaryLeadId = ownerLeadIds[0];
            if (primaryLeadId && primaryLeadId !== dtoLeadId) {
                bitrix.batch.lead.get('get_owner_lead', primaryLeadId);
            }
        } else {
            bitrix.batch.lead.get('get_lead_entity', entityId);
            this.queueActiveDealsLoad(bitrix, entityId, entityType, dealSelect);
        }

        if (dtoLeadId && entityType !== EEventReportEntityType.LEAD) {
            bitrix.batch.lead.get('get_dto_lead', dtoLeadId);
        }

        // currentTask грузить из Bitrix не нужно — фронт уже передал
        // полное содержимое в DTO (включая ufCrmTask в camelCase).
        const reportContactId = dto.report?.contact?.ID
            ? Number(dto.report.contact.ID)
            : null;
        if (reportContactId) {
            bitrix.batch.contact.get('get_report_contact', reportContactId);
        }
        const planContactId = dto.plan?.contact?.ID
            ? Number(dto.plan.contact.ID)
            : null;
        if (planContactId && planContactId !== reportContactId) {
            bitrix.batch.contact.get('get_plan_contact', planContactId);
        }

        const batchResults = await bitrix.api.callBatchWithConcurrency(1);
        const flat = this.flattenResults(batchResults);

        const company =
            entityType === EEventReportEntityType.COMPANY
                ? this.pick<IBXCompany>(flat, 'get_company')
                : null;
        const entityLead =
            entityType === EEventReportEntityType.LEAD
                ? this.pick<IBXLead>(flat, 'get_lead_entity')
                : null;
        const dtoLead = dtoLeadId
            ? this.pick<IBXLead>(flat, 'get_dto_lead')
            : null;
        const ownerDealLead = this.pick<IBXLead>(flat, 'get_owner_lead');
        const lead = entityLead ?? dtoLead ?? ownerDealLead;

        const dealsRaw = this.dedupeDealsById([
            ...(this.pick<IBXDeal[]>(flat, 'list_deals') ?? []),
            ...(this.pick<IBXDeal[]>(flat, 'list_deals_by_lead') ?? []),
        ]);

        const currentTask = (dto.currentTask ??
            null) as unknown as IBXTask | null;

        const reportContact = reportContactId
            ? this.pick<IBXContact>(flat, 'get_report_contact')
            : null;
        const planContact = planContactId
            ? (this.pick<IBXContact>(flat, 'get_plan_contact') ?? reportContact)
            : null;

        // === Фаза 2: распределить deals по категориям ===
        const activeDeals = this.filterActiveDeals(dealsRaw);
        const ownResponsibleIds = this.collectOwnResponsibleIds(dto);
        const dealsByCategory = this.groupDealsByCategory(
            activeDeals,
            portal,
            launchDealId,
            ownResponsibleIds,
        );
        const currentBaseDeal =
            dealsByCategory[PbxDealCategoryCodeEnum.sales_base] ?? null;
        const currentXoDeal =
            dealsByCategory[PbxDealCategoryCodeEnum.sales_xo] ?? null;

        // Диагностика кейса «flow действовал так, будто основной сделки нет»:
        // одна строка на запуск — какой контекст прислал фронт, что нашлось
        // и какая базовая выбрана. По инварианту домена открытая основная
        // сделка у клиента одна — вторая означает битые данные, о ней warn.
        this.logger.log(
            `init: entity=${entityType}:${entityId} ` +
                `context(co=${dto.context?.companyId ?? '-'},deal=${dto.context?.dealId ?? '-'},lead=${dto.context?.leadId ?? '-'}) ` +
                `deals=${dealsRaw.length} active=${activeDeals.length} ` +
                `own=${[...ownResponsibleIds].join('/') || '-'} ` +
                `base=${currentBaseDeal?.ID ?? 'null'}`,
        );
        const baseCategory = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        const baseDeals = baseCategory
            ? activeDeals.filter(
                  deal =>
                      String(deal.CATEGORY_ID) ===
                      String(baseCategory.bitrixId),
              )
            : [];
        if (baseDeals.length > 1) {
            this.logger.warn(
                `init: у ${entityType}:${entityId} ${baseDeals.length} открытых ` +
                    `основных сделок (${baseDeals.map(deal => deal.ID).join(', ')}) — ` +
                    `инвариант «одна основная» нарушен, выбрана ` +
                    // «никакая»: все открытые — чужие (правило владельца 25.08),
                    // flow создаст новую сделку ответственного отчёта.
                    `${currentBaseDeal?.ID ?? 'никакая (все чужие)'}` +
                    (launchDealId &&
                    String(currentBaseDeal?.ID) === String(launchDealId)
                        ? ' (сделка плейсмента)'
                        : ''),
            );
        }

        // === Фаза 3: presDeal/tmcDeal — по dealIds из dto.currentTask.ufCrmTask ===
        const taskCrmLinks = this.extractTaskCrmLinks(dto);
        const { currentPresDeal, currentTmcDeal } = this.resolveTaskLinkedDeals(
            taskCrmLinks,
            activeDeals,
            portal,
        );

        const currentTmcFromPresentation = this.resolveTmcLinkedToPresentation(
            currentPresDeal,
            dealsRaw,
        );

        return {
            entityId,
            entityType,
            company,
            lead,
            ownerDeal,
            currentBaseDeal,
            currentXoDeal,
            currentPresDeal,
            currentTmcDeal,
            currentTmcFromPresentation,
            currentTask,
            reportContact,
            planContact,
        };
    }

    private resolveEntity(dto: EventSalesFlowDto): {
        entityId: number;
        entityType: EventReportEntityType;
    } {
        // Приоритет — честный контекст. Компания остаётся самым широким
        // контекстом (даже когда открылись из сделки или задачи), сделка без
        // компании — легальный владелец, чистый лид — последним.
        const ctx = dto.context;
        if (ctx) {
            const companyId = this.toId(ctx.companyId);
            if (companyId) {
                return {
                    entityId: companyId,
                    entityType: EEventReportEntityType.COMPANY,
                };
            }
            const dealId = this.toId(ctx.dealId);
            if (dealId) {
                return {
                    entityId: dealId,
                    entityType: EEventReportEntityType.DEAL,
                };
            }
            const leadId = this.toId(ctx.leadId);
            if (leadId) {
                return {
                    entityId: leadId,
                    entityType: EEventReportEntityType.LEAD,
                };
            }
            // context прислан пустым — падаем в legacy-ветку, не в ошибку.
        }

        // Legacy-фолбэк: старые клиенты шлют placement, причём для
        // deal/task/call_card он подделан под CRM_COMPANY_DETAIL_TAB с
        // companyId в options.ID — поэтому «не LEAD → company».
        const placement = dto.placement?.placement ?? '';
        const placementOptId = dto.placement?.options?.ID
            ? Number(dto.placement.options.ID)
            : null;

        if (placement.includes('LEAD')) {
            const leadId = dto.lead?.ID ? Number(dto.lead.ID) : placementOptId;
            return {
                entityId: leadId ?? 0,
                entityType: EEventReportEntityType.LEAD,
            };
        }

        const companyId = placementOptId ?? null;
        if (companyId) {
            return {
                entityId: companyId,
                entityType: EEventReportEntityType.COMPANY,
            };
        }
        // fallback на lead
        const leadId = dto.lead?.ID ? Number(dto.lead.ID) : 0;
        return { entityId: leadId, entityType: EEventReportEntityType.LEAD };
    }

    private toId(value: number | undefined): number | null {
        const id = Number(value);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    /**
     * Сделка-владелец читается до общего батча: из её полей строится
     * остальная загрузка. Ошибка не роняет отчёт — контекст соберётся из
     * DTO (warning в лог, сущность недогружена).
     */
    private async fetchOwnerDeal(
        bitrix: BitrixService,
        dealId: number,
    ): Promise<IBXDeal | null> {
        try {
            // callType отдаёт обёртку IBitrixResponse — сущность в .result.
            const response = await bitrix.deal.get(dealId);
            return response?.result ?? null;
        } catch (error) {
            this.logger.warn(
                `owner deal load failed: deal ${dealId}: ${String(error)}`,
            );
            return null;
        }
    }

    /**
     * Все лиды сделки-владельца: стандартный `LEAD_ID` + наши поля связей
     * (`deal_from_lead_id`, `deal_joined_leads`, legacy `op_smart_lid(s)`),
     * резолвленные по слепку портала. Значения принимаются и как `L_12`,
     * и как голый id; поле не проинсталлено — просто пропускается.
     */
    private collectOwnerLeadIds(
        ownerDeal: IBXDeal | null,
        portal: PortalModel,
    ): number[] {
        if (!ownerDeal) return [];
        const raw = ownerDeal as unknown as Record<string, unknown>;
        const ids = new Set<number>();
        const primary = this.toId(Number(raw['LEAD_ID']));
        if (primary) ids.add(primary);

        for (const code of DEAL_LEAD_LINK_FIELD_CODES) {
            const field = portal.getEntityFieldByCode('deal', code);
            if (!field?.bitrixId) continue;
            const value = raw[`UF_CRM_${field.bitrixId}`];
            const values = Array.isArray(value)
                ? value
                : value !== null && value !== undefined
                  ? [value]
                  : [];
            for (const item of values) {
                const text = String(item ?? '').trim();
                const id = this.toId(
                    Number(/^L_/i.test(text) ? text.slice(2) : text),
                );
                if (id) ids.add(id);
            }
        }
        return [...ids];
    }

    /** Сделки, на которые владелец ссылается через to_*-поля воронок. */
    private collectOwnerLinkedDealIds(ownerDeal: IBXDeal | null): number[] {
        if (!ownerDeal) return [];
        const raw = ownerDeal as unknown as Record<string, unknown>;
        const ids = new Set<number>();
        for (const key of OWNER_DEAL_LINK_KEYS) {
            const id = this.toId(Number(raw[key]));
            if (id) ids.add(id);
        }
        return [...ids];
    }

    private dedupeDealsById(deals: IBXDeal[]): IBXDeal[] {
        const seen = new Set<string>();
        return deals.filter(deal => {
            const id = String(deal?.ID ?? '');
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    /** ID сделок из D_-ссылок задачи DTO (для владельца-сделки). */
    private extractTaskDealIds(dto: EventSalesFlowDto): number[] {
        return this.extractTaskCrmLinks(dto)
            .filter(value => value.startsWith('D_'))
            .map(value => Number(value.slice(2)))
            .filter(id => Number.isFinite(id) && id > 0);
    }

    /**
     * Грузит все активные сделки по entity: company — все сделки компании,
     * deal — владелец + переданные extraDealIds (ссылки задачи и to_*-полей),
     * lead — сделки лида. Закрытые отсекает `filterActiveDeals` после.
     */
    /** См. {@link buildDealListSelect} — вынесен в чистую функцию для тестов. */
    private dealListSelect(portal: PortalModel): string[] {
        return buildDealListSelect(portal);
    }

    private queueActiveDealsLoad(
        bitrix: BitrixService,
        entityId: number,
        entityType: EventReportEntityType,
        select: string[],
        extraDealIds: number[] = [],
    ): void {
        const filter: Partial<IBXDeal> = {};
        if (entityType === EEventReportEntityType.COMPANY) {
            (filter as Record<string, unknown>).COMPANY_ID = entityId;
        } else if (entityType === EEventReportEntityType.DEAL) {
            // Массив в значении фильтра = IN.
            (filter as Record<string, unknown>).ID = [
                entityId,
                ...extraDealIds.filter(id => id !== entityId),
            ];
        } else {
            (filter as Record<string, unknown>).LEAD_ID = entityId;
        }
        bitrix.batch.deal.getList('list_deals', filter, select);
    }

    private flattenResults(
        batchResults: IBitrixBatchResponseResult[],
    ): Record<string, unknown> {
        const flat: Record<string, unknown> = {};
        for (const chunk of batchResults) {
            for (const key in chunk.result) {
                flat[key] = chunk.result[key];
            }
        }
        return flat;
    }

    private pick<T>(flat: Record<string, unknown>, key: string): T | null {
        const value = flat[key];
        return value === undefined ? null : (value as T);
    }

    /**
     * Активные сделки = `CLOSED ≠ 'Y'`. Поле приходит из crm.deal.list даже
     * без явного select — фильтруем здесь, чтобы не зависеть от того, что
     * Bitrix положил в CATEGORY_ID для закрытых.
     */
    private filterActiveDeals(deals: IBXDeal[]): IBXDeal[] {
        return deals.filter(deal => {
            const closed = (deal as Record<string, unknown>)['CLOSED'];
            return closed !== 'Y' && closed !== true;
        });
    }

    /**
     * «Свои» сотрудники отчёта — те, чьи открытые сделки можно подхватывать
     * автоматически (правило владельца, 25.08):
     *  - ответственный плана (`plan.responsibility.ID` = ctx.planResponsibleId;
     *    фронт по умолчанию ставит сюда ТЕКУЩЕГО юзера фрейма) — flow именно
     *    ему назначает сделки/задачи (`ASSIGNED_BY_ID`);
     *  - ответственный закрываемой задачи (`currentTask.responsibleId`) — при
     *    ПЕРЕДАЧЕ клиента план уже указывает на нового менеджера, а сделка
     *    ещё висит на отправителе: без него передача создавала бы дубль
     *    вместо переназначения существующей сделки.
     *
     * Пустой набор (легаси-DTO без плана и задачи) — фильтр не применяется:
     * некого считать «своим», работаем как раньше.
     */
    private collectOwnResponsibleIds(dto: EventSalesFlowDto): Set<number> {
        const ids = new Set<number>();
        const planResponsible = this.toId(Number(dto.plan?.responsibility?.ID));
        if (planResponsible) ids.add(planResponsible);
        const taskResponsible = this.toId(
            Number(
                (dto.currentTask as { responsibleId?: unknown } | undefined)
                    ?.responsibleId,
            ),
        );
        if (taskResponsible) ids.add(taskResponsible);
        return ids;
    }

    /**
     * Первая активная сделка каждой категории, НО сделка запуска
     * (`preferredDealId`, из плейсмента) всегда перебивает найденную поиском.
     *
     * Без приоритета воспроизводился реальный инцидент: приложение открыто
     * из сделки, к которой привязали компанию с ДРУГОЙ, более ранней открытой
     * основной сделкой — `crm.deal.list` без ORDER отдаёт по ID ASC, первой
     * вставала ранняя сделка, и отказ закрывал ЕЁ, а не ту, из которой
     * работал менеджер.
     *
     * Правило владельца (25.08): автоматический поиск идёт ТОЛЬКО среди
     * сделок «своих» сотрудников ({@link collectOwnResponsibleIds}) —
     * `ASSIGNED_BY_ID` сравнивается ЧИСЛОМ (REST отдаёт строки). Чужая
     * открытая сделка молча не подхватывается никогда: отчёт не должен
     * двигать/закрывать сделку другого менеджера (двойная работа, путаница
     * в отчётах). Своих открытых нет — категория остаётся пустой, и flow
     * идёт своим штатным путём «сделки нет» (sales-base/xo создают новую
     * на ответственного отчёта). Исключение — сделка запуска: менеджер
     * ОСОЗНАННО открыл приложение из неё, это явный контекст, а не
     * молчаливый автоподбор, поэтому она в приоритете независимо от
     * ответственного.
     *
     * pres/tmc это правило не касается: они резолвятся не поиском по
     * компании, а явными D_-ссылками закрываемой задачи
     * ({@link resolveTaskLinkedDeals}).
     */
    private groupDealsByCategory(
        deals: IBXDeal[],
        portal: PortalModel,
        preferredDealId?: number | null,
        ownResponsibleIds: ReadonlySet<number> = new Set<number>(),
    ): Partial<Record<PbxDealCategoryCodeEnum, IBXDeal>> {
        const result: Partial<Record<PbxDealCategoryCodeEnum, IBXDeal>> = {};
        const categories = portal.getDealCategories();
        for (const deal of deals) {
            const category = categories.find(
                c => String(c.bitrixId) === String(deal.CATEGORY_ID),
            );
            if (!category) continue;
            const code = category.code as PbxDealCategoryCodeEnum;
            const isPreferred =
                preferredDealId != null &&
                String(deal.ID) === String(preferredDealId);
            // Пустой набор «своих» — фильтр выключен (легаси-DTO).
            const isOwn =
                ownResponsibleIds.size === 0 ||
                ownResponsibleIds.has(
                    Number((deal as Record<string, unknown>)['ASSIGNED_BY_ID']),
                );
            if (isPreferred || (!result[code] && isOwn)) {
                result[code] = deal;
            }
        }
        return result;
    }

    /**
     * Достаёт массив CRM-связей задачи (`D_*`, `C_*`, `CO_*`, `L_*`) из DTO.
     * Фронт уже передал `ufCrmTask` в camelCase; альтернативное поле
     * `UF_CRM_TASK` (snake_case) поддерживаем на всякий случай.
     */
    private extractTaskCrmLinks(dto: EventSalesFlowDto): string[] {
        const t = dto.currentTask as
            | undefined
            | (Record<string, unknown> & { ufCrmTask?: unknown });
        if (!t) return [];
        const raw = t.ufCrmTask ?? t['UF_CRM_TASK'];
        if (!Array.isArray(raw)) return [];
        return raw.filter((v): v is string => typeof v === 'string');
    }

    /**
     * Находит pres/tmc сделки, связанные с задачей. Берём dealIds из ufCrmTask
     * задачи и матчим их со сделками компании по категории — это надёжнее, чем
     * «первая активная сделка категории», когда у компании несколько сделок
     * одной воронки.
     */
    private resolveTaskLinkedDeals(
        taskCrmLinks: string[],
        activeDeals: IBXDeal[],
        portal: PortalModel,
    ): {
        currentPresDeal: IBXDeal | null;
        currentTmcDeal: IBXDeal | null;
    } {
        const dealIds = new Set(
            taskCrmLinks.filter(v => v.startsWith('D_')).map(v => v.slice(2)),
        );
        if (dealIds.size === 0) {
            return { currentPresDeal: null, currentTmcDeal: null };
        }
        const presCategory = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_presentation,
        );
        const tmcCategory = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.tmc_base,
        );

        const findInCategory = (
            categoryBitrixId: number | string | undefined,
        ): IBXDeal | null => {
            if (!categoryBitrixId) return null;
            const target = String(categoryBitrixId);
            return (
                activeDeals.find(
                    d =>
                        dealIds.has(String(d.ID)) &&
                        String(d.CATEGORY_ID) === target,
                ) ?? null
            );
        };

        return {
            currentPresDeal: findInCategory(presCategory?.bitrixId),
            currentTmcDeal: findInCategory(tmcCategory?.bitrixId),
        };
    }

    private resolveTmcLinkedToPresentation(
        presDeal: IBXDeal | null,
        allDeals: IBXDeal[],
    ): IBXDeal | null {
        if (!presDeal) return null;
        const presId = String(presDeal.ID);
        return (
            allDeals.find(d => {
                const raw = (d as Record<string, unknown>)[
                    'UF_CRM_TO_PRESENTATION_SALES'
                ];
                if (typeof raw !== 'string' && typeof raw !== 'number') {
                    return false;
                }
                return String(raw) === presId;
            }) ?? null
        );
    }
}
