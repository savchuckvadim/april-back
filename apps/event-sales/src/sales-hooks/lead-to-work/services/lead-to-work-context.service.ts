import { Logger } from '@nestjs/common';
import { BitrixService, IBXCompany, IBXDeal, IBXLead } from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';

/** Снимок всего, что нужно флоу по одному лиду. */
export interface LeadToWorkContext {
    lead: IBXLead;
    company: IBXCompany | null;
    /** Наша основная сделка по обратной ссылке лида to_base_sales. */
    existingOurDeal: IBXDeal | null;
    /** Наша ХО-сделка по обратной ссылке лида to_xo_sales (повторный ХО). */
    existingXoDeal: IBXDeal | null;
    /** Сделки, рождённые штатной конвертацией (deal.LEAD_ID = лид). */
    convertedDeals: IBXDeal[];
    /**
     * СВОИ сделки хука по прямому полю deal_from_lead_id='L_{id}' — страховка
     * reuse-гейта: обратная ссылка лида (to_base_sales) могла не записаться
     * (поле не было сопоставлено в момент прошлого прогона), а плодить пары
     * нельзя. Поле не сопоставлено сейчас → пустой список.
     */
    fromLeadDeals: IBXDeal[];
    openTasks: IBXTask[];
    /**
     * ВСЕ контакты лида (`crm.lead.contact.items.get` + штатный CONTACT_ID).
     * Переезжают на создаваемую сделку: у лида контактов бывает несколько,
     * и терять их при переходе в работу нельзя — по ним звонят.
     */
    contactIds: number[];
    /** Лид закрыт штатной конвертацией (SEMANTICS='S'/CONVERTED). */
    isConverted: boolean;
    warnings: string[];
}

type BxRow = Record<string, unknown>;

/**
 * Сколько чанков чтения шлём параллельно.
 *
 * ЕДИНИЦА — ПО ЗАМЕРУ, А НЕ ПО ОСТОРОЖНОСТИ. Тройка выглядела бесплатным
 * ускорением (в командах чтения нет ссылок $result, расщеплять их безопасно),
 * но на бою 15.09 дала ХУДШИЙ результат: 40 лидов за 294 с против 218 с при
 * единице. Портал не распараллеливает, а придушивает — и на четырёх и выше
 * начинает рвать соединения (socket hang up). Менять только с новым замером.
 */
const READ_CONCURRENCY = 1;

/** Что нужно знать о лиде, чтобы прочитать его ответы из общего батча. */
interface IEnvMeta {
    leadId: number;
    companyId: number | null;
    ourDealId: number | null;
    xoDealId: number | null;
    taskBindings: string[];
    warnings: string[];
}

/**
 * Prefetch контекста лида двумя волнами batch (2 HTTP):
 *   W1: лид;
 *   W2: компания + наша сделка (to_base_sales) + сделки конвертации + задачи.
 *
 * НЕ @Injectable: создаётся `new` с per-domain bitrix.
 */
export class LeadToWorkContextService {
    private readonly logger = new Logger(LeadToWorkContextService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /**
     * @param anyTaskGroup искать открытые задачи лида ВО ВСЕХ группах, а не
     * только в группе продаж портала. Нужен МАССОВОМУ ПЕРЕНОСУ исторической
     * базы (15.09.2026): у старых задач группы продаж нет — её как раз и
     * ставит перенос, — а обычный фильтр по `GROUP_ID` их не находил, и
     * задачи молча не переезжали: ни префикса «Звонок», ни группы, ни
     * привязки к сделке.
     */
    /**
     * Читает САМИ ЛИДЫ пачки одним batch-вызовом.
     *
     * Волна 1 (`crm.lead.get`) исторически шла отдельным HTTP НА КАЖДЫЙ лид,
     * и на массовом переносе именно она была потолком: замер 15.09 —
     * 20 лидов за 69 с, то есть ~1,7 с на запрос, 40 запросов на пачку из 20.
     * Батчем это один запрос на пачку.
     *
     * Лид, которого портал не отдал, в карту не попадает — `load()` для него
     * честно сходит за ним сам и бросит, если его действительно нет.
     */
    async preloadLeads(leadIds: number[]): Promise<Map<number, IBXLead>> {
        const byId = new Map<number, IBXLead>();
        if (!leadIds.length) return byId;

        for (const leadId of leadIds) {
            this.bitrix.batch.lead.get(`pre_lead_${leadId}`, leadId);
        }
        const responses =
            await this.bitrix.api.callBatchWithConcurrency(READ_CONCURRENCY);
        for (const chunk of responses) {
            for (const [cmd, value] of Object.entries(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                const id = Number(cmd.replace('pre_lead_', ''));
                if (!Number.isFinite(id) || !value) continue;
                byId.set(id, value as IBXLead);
            }
        }
        return byId;
    }

    /**
     * Контекст ПАЧКИ лидов — окружение всех лидов ОДНИМ batch-проводом.
     *
     * Было: на каждый лид отдельный `callBatchWithConcurrency` из ~6 команд,
     * то есть N HTTP-вызовов на пачку. На массовом переносе это и было
     * потолком скорости — замер 15.09: 20 лидов за ~100 с, портал отвечает
     * ~5 с на вызов.
     *
     * Стало: команды всех лидов копятся с ключами, привязанными к лиду
     * (`ctx_company_1961`), и уезжают одним вызовом. 20 лидов × 6 команд =
     * 120 команд = 3 HTTP (батч Битрикса режется по 50). Примерно в шесть раз
     * меньше запросов — и ровно во столько же быстрее.
     *
     * Лид, которого портал не отдал, попадает в результат ошибкой, а не
     * роняет пачку: на 6 тысячах записей один битый лид — норма.
     */
    async loadMany(
        leadIds: number[],
        anyTaskGroup = false,
    ): Promise<Map<number, LeadToWorkContext | Error>> {
        const out = new Map<number, LeadToWorkContext | Error>();
        if (!leadIds.length) return out;

        const leads = await this.preloadLeads(leadIds);

        // Волна 2: окружение ВСЕХ лидов в один буфер.
        const metaById = new Map<number, IEnvMeta>();
        for (const leadId of leadIds) {
            const lead = leads.get(leadId);
            if (!lead) {
                out.set(
                    leadId,
                    new Error(`Лид ${leadId} не найден на портале`),
                );
                continue;
            }
            metaById.set(
                leadId,
                this.queueEnvironment(leadId, lead, anyTaskGroup),
            );
        }
        if (!metaById.size) return out;

        const flat = await this.flushToFlatMap();

        for (const [leadId, meta] of metaById) {
            const lead = leads.get(leadId);
            if (!lead) continue;
            out.set(leadId, this.buildContext(lead, meta, flat));
        }
        return out;
    }

    /**
     * @param preloaded лид, уже прочитанный {@link preloadLeads} — тогда
     * волна 1 не делает своего HTTP-запроса.
     */
    async load(
        leadId: number,
        anyTaskGroup = false,
        preloaded?: IBXLead,
    ): Promise<LeadToWorkContext> {
        const lead = preloaded ?? (await this.bitrix.lead.get(leadId))?.result;
        if (!lead) {
            throw new Error(`Лид ${leadId} не найден на портале`);
        }
        const meta = this.queueEnvironment(leadId, lead, anyTaskGroup);
        const flat = await this.flushToFlatMap();
        return this.buildContext(lead, meta, flat);
    }

    /**
     * Ставит команды окружения ОДНОГО лида в общий буфер. Ключи команд
     * привязаны к лиду: без этого пачка из двадцати лидов затирала бы сама
     * себя (batch-карта Битрикса при одинаковом ключе молча оставляет первую
     * команду), а задачи двух лидов ОДНОЙ компании склеились бы по общему
     * `CO_`-ключу.
     */
    private queueEnvironment(
        leadId: number,
        lead: IBXLead,
        anyTaskGroup: boolean,
    ): IEnvMeta {
        const warnings: string[] = [];
        const companyId = this.numberOf((lead as BxRow).COMPANY_ID);
        const ourDealId = this.parseDealRef(
            this.leadFieldValue(
                lead as BxRow,
                PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
            ),
        );
        const xoDealId = this.parseDealRef(
            this.leadFieldValue(
                lead as BxRow,
                PBX_SALES_EVENT_FIELD_CODES.to_xo_sales,
            ),
        );

        if (companyId) {
            this.bitrix.batch.company.get(`ctx_company_${leadId}`, companyId);
        }
        if (ourDealId) {
            this.bitrix.batch.deal.get(`ctx_our_deal_${leadId}`, ourDealId);
        }
        if (xoDealId) {
            // Повторный ХО: существующая ХО-сделка нужна для передачи
            // ответственного и KPI «не состоялся» прежнему менеджеру.
            this.bitrix.batch.deal.get(`ctx_our_xo_deal_${leadId}`, xoDealId);
        }
        // Штатная конвертация: гейт против сделки-дубля.
        this.bitrix.batch.deal.getList(
            `ctx_converted_deals_${leadId}`,
            { LEAD_ID: leadId } as never,
            ['ID', 'TITLE', 'CATEGORY_ID', 'STAGE_ID', 'CLOSED', 'COMPANY_ID'],
        );
        // Свои сделки прошлых прогонов — по прямому полю deal_from_lead_id.
        const fromLeadFieldName = this.dealFieldName(
            PBX_SALES_EVENT_FIELD_CODES.deal_from_lead_id,
        );
        if (fromLeadFieldName) {
            this.bitrix.batch.deal.getList(
                `ctx_from_lead_deals_${leadId}`,
                { [fromLeadFieldName]: `L_${leadId}` } as never,
                [
                    'ID',
                    'TITLE',
                    'CATEGORY_ID',
                    'STAGE_ID',
                    'CLOSED',
                    'COMPANY_ID',
                    'ASSIGNED_BY_ID',
                ],
            );
        } else {
            warnings.push(
                'Поле deal_from_lead_id не сопоставлено — reuse-гейт видит только ссылки лида (to_base_sales)',
            );
        }
        // Контакты лида: у лида их бывает несколько (штатный CONTACT_ID —
        // только «главный»), а на сделку должны переехать все.
        this.bitrix.batch.lead.contactItemsGet(
            `ctx_lead_contacts_${leadId}`,
            leadId,
        );

        const taskGroupId = this.portal.getSalesTaskGroupId();
        const taskBindings = [`L_${leadId}`];
        if (companyId) taskBindings.push(`CO_${companyId}`);
        for (const binding of taskBindings) {
            this.bitrix.batch.task.getList(
                `ctx_tasks_${leadId}_${binding}`,
                {
                    UF_CRM_TASK: [binding],
                    '!STATUS': EBXTaskStatus.COMPLETED,
                    ...(taskGroupId && !anyTaskGroup
                        ? { GROUP_ID: taskGroupId }
                        : {}),
                } as never,
                ['ID', 'TITLE', 'RESPONSIBLE_ID', 'UF_CRM_TASK', 'STATUS'],
            );
        }

        return {
            leadId,
            companyId,
            ourDealId,
            xoDealId,
            taskBindings,
            warnings,
        };
    }

    /** Отправляет накопленный буфер и раскладывает ответы в плоскую карту. */
    private async flushToFlatMap(): Promise<Map<string, unknown>> {
        /*
         * ЧТЕНИЕ можно слать параллельно: между командами чтения нет ссылок
         * $result[...], поэтому расщепление на чанки ничего не ломает — в
         * отличие от ЗАПИСИ, где порядок и одна HTTP-граница обязательны
         * (ai/rules/bitrix-batch-grouping.md). Портал отвечает ~5 с на батч
         * независимо от его размера, так что три чанка разом — втрое быстрее.
         */
        const responses =
            await this.bitrix.api.callBatchWithConcurrency(READ_CONCURRENCY);
        const flat = new Map<string, unknown>();
        for (const chunk of responses) {
            for (const [cmd, value] of Object.entries(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                flat.set(cmd, value);
            }
        }
        return flat;
    }

    /** Ответы батча → контекст одного лида. */
    private buildContext(
        lead: IBXLead,
        meta: IEnvMeta,
        flat: Map<string, unknown>,
    ): LeadToWorkContext {
        const { leadId } = meta;
        const company = meta.companyId
            ? ((flat.get(`ctx_company_${leadId}`) as IBXCompany | undefined) ??
              null)
            : null;
        const existingOurDeal = meta.ourDealId
            ? ((flat.get(`ctx_our_deal_${leadId}`) as IBXDeal | undefined) ??
              null)
            : null;
        const existingXoDeal = meta.xoDealId
            ? ((flat.get(`ctx_our_xo_deal_${leadId}`) as IBXDeal | undefined) ??
              null)
            : null;
        const convertedDeals = this.rowsOf(
            flat.get(`ctx_converted_deals_${leadId}`),
        ) as unknown as IBXDeal[];
        const fromLeadDeals = this.rowsOf(
            flat.get(`ctx_from_lead_deals_${leadId}`),
        ) as unknown as IBXDeal[];

        const openTasks: IBXTask[] = [];
        const seenTaskIds = new Set<string>();
        for (const binding of meta.taskBindings) {
            const raw = flat.get(`ctx_tasks_${leadId}_${binding}`) as
                | { tasks?: IBXTask[] }
                | undefined;
            for (const task of raw?.tasks ?? []) {
                const row = task as unknown as BxRow;
                const id = this.textOf(row.id) || this.textOf(row.ID);
                if (!id || seenTaskIds.has(id)) continue;
                seenTaskIds.add(id);
                openTasks.push(task);
            }
        }

        const semantics = this.textOf(
            (lead as BxRow).STATUS_SEMANTIC_ID,
        ).toUpperCase();
        const isConverted =
            semantics === 'S' ||
            this.textOf((lead as BxRow).STATUS_ID) === 'CONVERTED';

        return {
            lead,
            company,
            existingOurDeal,
            existingXoDeal,
            convertedDeals,
            fromLeadDeals,
            openTasks,
            contactIds: this.collectContactIds(
                lead as BxRow,
                flat.get(`ctx_lead_contacts_${leadId}`),
            ),
            isConverted,
            warnings: meta.warnings,
        };
    }

    /**
     * Контакты лида: главный (`CONTACT_ID`) + все привязанные
     * (`crm.lead.contact.items.get` → `[{CONTACT_ID, SORT}]`). Порядок
     * сохраняем — первым идёт главный, он же станет `CONTACT_ID` сделки.
     */
    private collectContactIds(lead: BxRow, itemsRaw: unknown): number[] {
        const ids: number[] = [];
        const push = (raw: unknown): void => {
            const id = Number(raw);
            if (Number.isFinite(id) && id > 0 && !ids.includes(id)) {
                ids.push(id);
            }
        };

        push(lead.CONTACT_ID);
        for (const item of this.rowsOf(itemsRaw)) {
            push(item.CONTACT_ID ?? item.ID);
        }
        return ids;
    }

    /** Значение UF-поля лида по pbx-коду; null при ненайденном поле. */
    leadFieldValue(lead: BxRow, code: string): unknown {
        const field = this.portal.getEntityFieldByCode('lead', code);
        if (!field) return null;
        return lead[this.portal.getFieldBitrixId(field)];
    }

    /** UF-имя поля сделки по pbx-коду; null → поле не установлено. */
    dealFieldName(code: string): string | null {
        const field = this.portal.getEntityFieldByCode('deal', code);
        return field ? this.portal.getFieldBitrixId(field) : null;
    }

    /** Разбор ссылки `D_123` / `123` на id сделки. */
    parseDealRef(raw: unknown): number | null {
        const values = Array.isArray(raw) ? raw : [raw];
        for (const value of values) {
            if (value == null) continue;
            const text = String(value as string | number).trim();
            const match = /^(?:D_)?(\d+)$/.exec(text);
            if (match) return Number(match[1]);
        }
        return null;
    }

    private numberOf(raw: unknown): number | null {
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : null;
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
            if (Array.isArray(container.result))
                return container.result as BxRow[];
        }
        return [];
    }
}
