import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import {
    IPCategory,
    IStage,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { DuplicateEntityType } from '../type/duplicate.type';
import { resolveDuplicateDealCategories } from '../lib/deal-category.filter';
import {
    HIDDEN_STAGE_BITRIX_IDS,
    RelatedContact,
    RelatedDeal,
    RelatedEntitiesOptions,
    RelatedEntitiesResult,
    RelatedLead,
    RelatedStage,
    ResponsibleUser,
} from '../type/related.type';
import { ResponsibleService } from './responsible.service';

type BitrixInstance = Awaited<ReturnType<PBXService['init']>>['bitrix'];
type BxRow = Record<string, unknown>;

/** Якорь связей: от кого пляшем и что у него уже прочитано. */
interface RelatedAnchor {
    companyId?: number;
    contactId?: number;
    /** Анкер — сам лид (entityType=LEAD). */
    leadId?: number;
    /**
     * Анкер — сделка: её id и ВСЕ её лиды. Стандартный `LEAD_ID` одиночный
     * (лид-первоисточник конвертации); несколько лидов у сделки появляются
     * только через наши multiple-поля `op_smart_lids`/`op_smart_lid` —
     * читаем и их, когда поля проинсталлены на портале.
     */
    dealId?: number;
    dealLeadIds?: number[];
    assignedById?: number;
    requests: number;
}

/**
 * Коды pbx-полей сделки со связанными лидами. Поля опциональны: нет на
 * портале → просто не участвуют (не ошибка).
 *
 *  - `deal_from_lead_id` — «создана из лида» БЕЗ конвертации Битрикса
 *    (пишет хук «лид → работа»); ручная конвертация покрыта стандартным
 *    `LEAD_ID`, который читается всегда;
 *  - `deal_joined_leads` — multiple «присоединённые лиды» (union пишет хук,
 *    merge сливает массивы жертв в survivor);
 *  - `op_smart_lid`/`op_smart_lids` — legacy-коды smart-флоу, на случай
 *    порталов, где связи писались туда.
 */
const DEAL_LEAD_LINK_FIELD_CODES = [
    'deal_from_lead_id',
    'deal_joined_leads',
    'op_smart_lid',
    'op_smart_lids',
] as const;

const DEAL_SELECT = [
    'ID',
    'TITLE',
    'STAGE_ID',
    'CATEGORY_ID',
    'ASSIGNED_BY_ID',
    'OPPORTUNITY',
    'CLOSED',
    'DATE_CREATE',
    'LEAD_ID',
];

const LEAD_SELECT = [
    'ID',
    'TITLE',
    'STATUS_ID',
    'STATUS_SEMANTIC_ID',
    'ASSIGNED_BY_ID',
    'DATE_CREATE',
    'SOURCE_ID',
    // Чужие поля сайтов-лидогенов — одинаковые на всех порталах:
    // «Оценка» (URL опросника) и «Код партнёра». Заполнены → заявка с сайта.
    'UF_CRM_LEAD_QUEST_URL',
    'UF_CRM_REG_NUMBER',
];

/** Код UF-поля лида «Источник список» — его сырое значение отдаём фронту. */
const LEAD_OP_SOURCE_FIELD_CODE = 'op_source_select';

/**
 * Коды UF-полей ЛИДА со ссылкой на сделку (обратные рёбра, хранятся на лиде):
 *  - `to_base_sales` — ХО-лид пишет свою базовую сделку;
 *  - `to_sale_deal` — пользователь пометил заявку, с которой прошла продажа
 *    (атрибуция продажи; пара к флагу `op_lead_is_boost_sale`).
 * Поле не проинсталлено → просто пропускается.
 */
const LEAD_TO_DEAL_LINK_FIELD_CODES = [
    'to_base_sales', // связб со сделкой Основной ОП
    'to_sale_deal', // связь со сделкой по которой прошла продажа в следствие данной заявки
] as const;

const CONTACT_SELECT = [
    'ID',
    'NAME',
    'LAST_NAME',
    'POST',
    'ASSIGNED_BY_ID',
    'PHONE',
];

/**
 * Что уже происходит с найденным контрагентом: наши сделки и лиды по нему,
 * с человеческой стадией и ответственным.
 *
 * Стадии не хардкодятся: их коды, названия, порядок и цвета берутся из
 * PortalModel — то есть из настроек конкретного портала. Поэтому «узкая
 * разноцветная полоска» на фронте рисуется теми же цветами, что менеджер
 * видит в своей воронке.
 */
@Injectable()
export class RelatedEntitiesService {
    private readonly logger = new Logger(RelatedEntitiesService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly responsible: ResponsibleService,
    ) {}

    async getRelated(
        domain: string,
        entityType: DuplicateEntityType,
        entityId: number,
        options: RelatedEntitiesOptions = {},
    ): Promise<RelatedEntitiesResult> {
        const warnings: string[] = [];
        const { bitrix, PortalModel: portalModel } =
            await this.pbx.init(domain);

        const anchor = await this.resolveAnchor(
            bitrix,
            portalModel,
            entityType,
            entityId,
            warnings,
        );
        let requests = anchor.requests;

        // Карточка кандидата показывает сделки только НАШИХ воронок —
        // тот же фильтр, что и в плане поиска (без фолбэка на все воронки).
        const categories = resolveDuplicateDealCategories(portalModel);
        warnings.push(...categories.warnings);

        // UF «Источник список»: сырое значение отдаём фронту как есть —
        // семантика («Заявка с сайта») резолвится по слепку в приложении.
        const opSourceField = portalModel?.getEntityFieldByCode?.(
            'lead',
            LEAD_OP_SOURCE_FIELD_CODE,
        );
        const opSourceKey = opSourceField?.bitrixId
            ? `UF_CRM_${opSourceField.bitrixId}`
            : null;

        // Обратные рёбра «лид → сделка», хранящиеся НА ЛИДЕ: `to_base_sales`
        // (ХО-лид пишет ссылку на базовую сделку) и `to_sale_deal` (пользователь
        // пометил заявку, с которой прошла продажа). По ним лиды сделки
        // находятся даже без компании, LEAD_ID и полей присоединения.
        const leadToDealKeys = LEAD_TO_DEAL_LINK_FIELD_CODES.map(code => {
            const field = portalModel?.getEntityFieldByCode?.('lead', code);
            return field?.bitrixId ? `UF_CRM_${field.bitrixId}` : null;
        }).filter((key): key is string => key !== null);

        const { deals, leads, contactIds } = await this.fetchRelated(
            bitrix,
            anchor,
            options,
            warnings,
            categories.allowedBitrixIds,
            opSourceKey,
            leadToDealKeys,
        );
        requests += 1;

        const contacts = await this.fetchContacts(
            bitrix,
            contactIds,
            warnings,
        );
        requests += contactIds.length ? 1 : 0;

        const stageIndex = this.buildStageIndex(portalModel);
        const visibleDeals = deals.filter(deal =>
            this.isVisibleStage(this.textOf(deal.STAGE_ID)),
        );

        const responsibleIds = [
            ...visibleDeals.map(row => Number(row.ASSIGNED_BY_ID)),
            ...leads.map(row => Number(row.ASSIGNED_BY_ID)),
            ...contacts.map(row => Number(row.ASSIGNED_BY_ID)),
        ];
        const people = await this.responsible.resolve(bitrix, responsibleIds);
        requests += responsibleIds.length ? 2 : 0;

        return {
            entityType,
            entityId,
            responsible: this.anchorResponsible(anchor, people),
            deals: visibleDeals.map(row =>
                this.toDeal(row, stageIndex, people),
            ),
            leads: leads.map(row => this.toLead(row, people, opSourceKey)),
            contacts: contacts.map(row => this.toContact(row, people)),
            batchRequests: requests,
            warnings,
        };
    }

    /* ------------------------------------------------------------------ *
     * От кого пляшем
     * ------------------------------------------------------------------ */

    /**
     * Сделка сама по себе не «контрагент»: связанные сделки ищутся по её
     * компании, контакту или лидам. Поэтому для DEAL сначала читаем саму
     * сделку — `LEAD_ID` и UF-поля присоединённых лидов приходят в том же
     * ответе `crm.deal.get`, ноль дополнительных запросов.
     */
    private async resolveAnchor(
        bitrix: BitrixInstance,
        portalModel: Awaited<ReturnType<PBXService['init']>>['PortalModel'],
        entityType: DuplicateEntityType,
        entityId: number,
        warnings: string[],
    ): Promise<RelatedAnchor> {
        if (entityType === DuplicateEntityType.COMPANY) {
            return { companyId: entityId, requests: 0 };
        }
        if (entityType === DuplicateEntityType.CONTACT) {
            return { contactId: entityId, requests: 0 };
        }
        if (entityType === DuplicateEntityType.LEAD) {
            return { leadId: entityId, requests: 0 };
        }

        try {
            const response = await bitrix.deal.get(entityId);
            const deal = (response?.result ?? {}) as unknown as BxRow;

            return {
                dealId: entityId,
                companyId: this.id(deal?.COMPANY_ID),
                contactId: this.id(deal?.CONTACT_ID),
                dealLeadIds: this.collectDealLeadIds(deal, portalModel),
                assignedById: this.id(deal?.ASSIGNED_BY_ID),
                requests: 1,
            };
        } catch (error) {
            warnings.push(
                `Не удалось прочитать сделку: ${this.errorText(error)}`,
            );
            return { dealId: entityId, requests: 1 };
        }
    }

    /**
     * Все лиды сделки: стандартный `LEAD_ID` (он одиночный — Битрикс хранит
     * только лид-первоисточник конвертации; при мерже сделок лид проигравшей
     * теряется) + наши multiple-поля `op_smart_lids`/`op_smart_lid`, куда
     * flow присоединения может дописывать остальных. Поля резолвятся через
     * слепок портала — не проинсталлены → пусто, штатная деградация.
     */
    private collectDealLeadIds(
        deal: BxRow,
        portalModel: Awaited<ReturnType<PBXService['init']>>['PortalModel'],
    ): number[] {
        const ids = new Set<number>();
        const primary = this.id(deal?.LEAD_ID);
        if (primary) ids.add(primary);

        for (const code of DEAL_LEAD_LINK_FIELD_CODES) {
            try {
                const field = portalModel?.getEntityFieldByCode?.('deal', code);
                if (!field?.bitrixId) continue;
                const raw = deal?.[`UF_CRM_${field.bitrixId}`];
                const values = Array.isArray(raw)
                    ? raw
                    : raw !== null && raw !== undefined
                      ? [raw]
                      : [];
                for (const value of values) {
                    // crm-multiple хранит `L_12`, числовые UF — голый id.
                    const text = String(value ?? '').trim();
                    const id = this.id(
                        /^L_/i.test(text) ? text.slice(2) : text,
                    );
                    if (id) ids.add(id);
                }
            } catch {
                // Слепок без метода/поля — тихо пропускаем, это не ошибка.
            }
        }
        return [...ids];
    }

    private anchorResponsible(
        anchor: { assignedById?: number },
        people: Map<number, ResponsibleUser>,
    ): ResponsibleUser | undefined {
        return anchor.assignedById
            ? people.get(anchor.assignedById)
            : undefined;
    }

    /* ------------------------------------------------------------------ *
     * Запрос связанных
     * ------------------------------------------------------------------ */

    private async fetchRelated(
        bitrix: BitrixInstance,
        anchor: RelatedAnchor,
        options: RelatedEntitiesOptions,
        warnings: string[],
        dealCategoryBitrixIds: number[] = [],
        leadOpSourceKey: string | null = null,
        leadToDealKeys: string[] = [],
    ): Promise<{ deals: BxRow[]; leads: BxRow[]; contactIds: number[] }> {
        const leadSelect = leadOpSourceKey
            ? [...LEAD_SELECT, leadOpSourceKey]
            : LEAD_SELECT;
        const dealFilter: Record<string, unknown> = {};
        const leadFilter: Record<string, unknown> = {};
        const dealModifiers: Record<string, unknown> = {};
        if (dealCategoryBitrixIds.length) {
            dealModifiers.CATEGORY_ID = dealCategoryBitrixIds;
        }
        if (!options.includeClosed) {
            dealModifiers.CLOSED = 'N';
        }

        if (anchor.companyId) {
            dealFilter.COMPANY_ID = anchor.companyId;
            leadFilter.COMPANY_ID = anchor.companyId;
        }
        if (anchor.contactId) {
            dealFilter.CONTACT_ID = anchor.contactId;
            leadFilter.CONTACT_ID = anchor.contactId;
        }
        if (anchor.leadId) {
            dealFilter.LEAD_ID = anchor.leadId;
        }

        // Лиды сделки-якоря: фильтры Битрикса склеиваются по AND, поэтому
        // сделки тех же лидов запрашиваются ОТДЕЛЬНОЙ командой (массив в
        // значении фильтра = IN), а не примесью LEAD_ID к company/contact.
        const dealLeadIds = anchor.dealLeadIds ?? [];

        const hasDealFilter = Object.keys(dealFilter).length > 0;
        const hasLeadFilter = Object.keys(leadFilter).length > 0;
        const hasAnyAnchor =
            hasDealFilter || hasLeadFilter || dealLeadIds.length > 0;
        const hasContactSource = !!(
            anchor.dealId ??
            anchor.companyId ??
            anchor.contactId
        );

        // CATEGORY_ID и CLOSED — служебные ограничения, не якорь: без
        // companyId/contactId/leadId сделки не запрашиваем вовсе (иначе
        // выгребли бы всю воронку портала). Молча пустым не отвечаем.
        if (!hasAnyAnchor && !hasContactSource) {
            warnings.push(
                'У якоря нет ни компании, ни контакта, ни лида — связанных сущностей не существует',
            );
            return { deals: [], leads: [], contactIds: [] };
        }

        if (hasDealFilter) {
            bitrix.batch.deal.getList(
                'deals',
                { ...dealFilter, ...dealModifiers } as never,
                DEAL_SELECT,
                { ID: 'DESC' },
            );
        }
        if (dealLeadIds.length) {
            bitrix.batch.deal.getList(
                'deals_by_lead',
                { LEAD_ID: dealLeadIds, ...dealModifiers } as never,
                DEAL_SELECT,
                { ID: 'DESC' },
            );
            // Сами лиды сделки тоже отдаём в leads — у каждого своя богатая
            // история, ради них всё и затевалось.
            bitrix.batch.lead.getList(
                'anchor_lead',
                { ID: dealLeadIds } as never,
                leadSelect,
            );
        }
        // Обратные рёбра: лиды, прицепленные к сделке-якорю через свои
        // to_*-поля (to_base_sales — ХО-лид, to_sale_deal — атрибуция продажи).
        if (anchor.dealId) {
            leadToDealKeys.forEach((key, index) => {
                bitrix.batch.lead.getList(
                    `leads_by_deal_link_${index}`,
                    { [key]: anchor.dealId } as never,
                    leadSelect,
                );
            });
        }
        if (hasLeadFilter) {
            bitrix.batch.lead.getList(
                'leads',
                leadFilter as never,
                leadSelect,
                { ID: 'DESC' },
            );
        }

        // Контакты владельца: у сделки-якоря — её contact items (их может
        // быть несколько, CONTACT_ID — только главный), у компании — её.
        if (anchor.dealId) {
            bitrix.batch.deal.contactItemsGet('contact_items', anchor.dealId);
        } else if (anchor.companyId) {
            bitrix.batch.company.contactItemsGet(
                'contact_items',
                anchor.companyId,
            );
        }

        try {
            const chunks = await bitrix.api.callBatchAsync();
            const byCmd = new Map<string, unknown>();
            for (const chunk of chunks) {
                const rows = (chunk?.result ?? {}) as Record<string, unknown>;
                for (const [cmd, value] of Object.entries(rows)) {
                    byCmd.set(cmd, value);
                }
            }
            const contactIds = this.contactIdsOf(
                byCmd.get('contact_items'),
                anchor.contactId,
            );
            return {
                deals: this.dedupeRows([
                    ...this.rowsOf(byCmd.get('deals')),
                    ...this.rowsOf(byCmd.get('deals_by_lead')),
                ]),
                leads: this.dedupeRows([
                    ...this.rowsOf(byCmd.get('leads')),
                    ...this.rowsOf(byCmd.get('anchor_lead')),
                    ...leadToDealKeys.flatMap((_, index) =>
                        this.rowsOf(byCmd.get(`leads_by_deal_link_${index}`)),
                    ),
                ]),
                contactIds,
            };
        } catch (error) {
            warnings.push(
                `Не удалось получить связанные сущности: ${this.errorText(error)}`,
            );
            return { deals: [], leads: [], contactIds: [] };
        }
    }

    /** Полные карточки контактов одним `crm.contact.list` по списку id. */
    private async fetchContacts(
        bitrix: BitrixInstance,
        contactIds: number[],
        warnings: string[],
    ): Promise<BxRow[]> {
        if (!contactIds.length) return [];
        try {
            const response = await bitrix.contact.getList(
                { ID: contactIds } as never,
                CONTACT_SELECT,
            );
            return this.rowsOf(response?.result);
        } catch (error) {
            warnings.push(
                `Не удалось получить контакты: ${this.errorText(error)}`,
            );
            return [];
        }
    }

    /** ID контактов из ответа `crm.*.contact.items.get` (+ главный контакт). */
    private contactIdsOf(raw: unknown, primaryId?: number): number[] {
        const ids = new Set<number>();
        if (primaryId) ids.add(primaryId);
        for (const row of this.rowsOf(raw)) {
            const id = this.id(row.CONTACT_ID);
            if (id) ids.add(id);
        }
        return [...ids];
    }

    private dedupeRows(rows: BxRow[]): BxRow[] {
        const seen = new Set<string>();
        return rows.filter(row => {
            const id = String(row.ID ?? '');
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    /* ------------------------------------------------------------------ *
     * Стадии из PortalModel
     * ------------------------------------------------------------------ */

    /**
     * `C{categoryBitrixId}:{stageBitrixId}` → описание стадии. Ровно так
     * Битрикс склеивает STAGE_ID сделки (см. ColdPortalDealModel в event-sales).
     */
    private buildStageIndex(
        portalModel: Awaited<ReturnType<PBXService['init']>>['PortalModel'],
    ): Map<string, RelatedStage> {
        const index = new Map<string, RelatedStage>();

        let categories: IPCategory[] = [];
        try {
            categories = portalModel?.getDealCategories?.() ?? [];
        } catch (error) {
            this.logger.warn(
                `Воронки портала недоступны: ${this.errorText(error)}`,
            );
            return index;
        }

        for (const category of categories) {
            const stages: IStage[] = category.stages ?? [];
            stages.forEach((stage, position) => {
                const bitrixId = `C${category.bitrixId}:${stage.bitrixId}`;
                index.set(bitrixId, {
                    bitrixId,
                    code: stage.code,
                    title: stage.title || stage.name,
                    color: stage.color,
                    categoryCode: category.code,
                    categoryTitle: category.title || category.name,
                    order: position,
                    total: stages.length,
                });
            });
        }
        return index;
    }

    /** APOLOGY — техническая стадия, менеджеру показывать нечего. */
    private isVisibleStage(stageId: string): boolean {
        const suffix = stageId.includes(':')
            ? stageId.split(':').slice(1).join(':')
            : stageId;
        return !HIDDEN_STAGE_BITRIX_IDS.includes(suffix);
    }

    /* ------------------------------------------------------------------ *
     * Маппинг строк
     * ------------------------------------------------------------------ */

    private toDeal(
        row: BxRow,
        stageIndex: Map<string, RelatedStage>,
        people: Map<number, ResponsibleUser>,
    ): RelatedDeal {
        const stageId = this.textOf(row.STAGE_ID);
        const assignedId = this.id(row.ASSIGNED_BY_ID);

        return {
            id: Number(row.ID),
            title: this.textOf(row.TITLE) || `Сделка ${Number(row.ID)}`,
            stage: stageIndex.get(stageId) ?? { bitrixId: stageId },
            responsible: assignedId ? people.get(assignedId) : undefined,
            opportunity: row.OPPORTUNITY ? Number(row.OPPORTUNITY) : undefined,
            closed: (this.textOf(row.CLOSED) || 'N') === 'Y',
            dateCreate: this.textOf(row.DATE_CREATE) || undefined,
            leadId: this.id(row.LEAD_ID),
        };
    }

    private toContact(
        row: BxRow,
        people: Map<number, ResponsibleUser>,
    ): RelatedContact {
        const assignedId = this.id(row.ASSIGNED_BY_ID);
        // PHONE — множественное crm-поле: массив { VALUE, VALUE_TYPE }.
        const phones = Array.isArray(row.PHONE)
            ? (row.PHONE as { VALUE?: unknown }[])
                  .map(item => this.textOf(item?.VALUE))
                  .filter(Boolean)
            : undefined;

        return {
            id: Number(row.ID),
            name: this.textOf(row.NAME) || undefined,
            lastName: this.textOf(row.LAST_NAME) || undefined,
            post: this.textOf(row.POST) || undefined,
            phones: phones?.length ? phones : undefined,
            responsible: assignedId ? people.get(assignedId) : undefined,
        };
    }

    private toLead(
        row: BxRow,
        people: Map<number, ResponsibleUser>,
        opSourceKey: string | null = null,
    ): RelatedLead {
        const assignedId = this.id(row.ASSIGNED_BY_ID);
        // UF enumeration в list-строке — скаляр либо массив с одним значением.
        const opSourceValue = opSourceKey ? row[opSourceKey] : undefined;
        const opSourceRaw = Array.isArray(opSourceValue)
            ? this.textOf(opSourceValue[0])
            : this.textOf(opSourceValue);

        return {
            id: Number(row.ID),
            title: this.textOf(row.TITLE) || `Лид ${Number(row.ID)}`,
            statusId: this.textOf(row.STATUS_ID) || undefined,
            statusSemanticId: this.textOf(row.STATUS_SEMANTIC_ID) || undefined,
            responsible: assignedId ? people.get(assignedId) : undefined,
            dateCreate: this.textOf(row.DATE_CREATE) || undefined,
            sourceId: this.textOf(row.SOURCE_ID) || undefined,
            opSourceRaw: opSourceRaw || undefined,
            questUrl: this.textOf(row.UF_CRM_LEAD_QUEST_URL) || undefined,
            regNumber: this.textOf(row.UF_CRM_REG_NUMBER) || undefined,
        };
    }

    /** Скаляр → строка; объекты не сериализуем ('[object Object]'-защита). */
    private textOf(raw: unknown): string {
        if (typeof raw === 'string') return raw.trim();
        if (typeof raw === 'number' || typeof raw === 'bigint') {
            return String(raw);
        }
        return '';
    }

    private rowsOf(raw: unknown): BxRow[] {
        if (Array.isArray(raw)) return raw as BxRow[];
        if (raw && typeof raw === 'object') {
            const container = raw as { items?: unknown; result?: unknown };
            if (Array.isArray(container.items))
                return container.items as BxRow[];
            if (Array.isArray(container.result)) {
                return container.result as BxRow[];
            }
        }
        return [];
    }

    private id(raw: unknown): number | undefined {
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : undefined;
    }

    private errorText(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
