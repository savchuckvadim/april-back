import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    corporateEmailDomain,
    extractInnFromTitle,
    normalizeEmail,
    normalizeInnList,
    normalizePhone,
    uniq,
} from '@lib/portal-lib/pbx-duplicate';
import type { SignalFieldRef } from '@lib/portal-lib/pbx-duplicate';
import {
    IRepeatDealInfo,
    IRepeatResolution,
    IRepeatSignalCandidates,
    RepeatSignalKind,
    resolveRepeatWork,
} from '../lib/repeat-work.resolver';

type BxRow = Record<string, unknown>;

/** Лид на входе файндера: id + уже прочитанная строка. */
export interface IRepeatFinderLead {
    leadId: number;
    row: BxRow;
}

/** Итог по одному лиду: решение + открытые задачи основной (для join). */
export interface IRepeatFindOutcome {
    resolution: IRepeatResolution;
    /** Открытые задачи основной сделки — «одна задача ХО» решается по ним. */
    openMainTasks: BxRow[];
    warnings: string[];
}

/** ИНН-поля портала по сущностям (SignalFieldMapService, кэш 24 ч). */
export interface IRepeatInnFields {
    lead: SignalFieldRef[];
    deal: SignalFieldRef[];
    company: SignalFieldRef[];
}

/** Бюджеты сигналов: пачка из 20 заявок должна влезать в разумный батч. */
const MAX_PHONES = 3;
const MAX_EMAILS = 3;
const MAX_DOMAINS = 2;
const MAX_INNS = 3;
const MAX_COMPANIES = 5;
const MAX_CONTACTS = 5;
const MAX_SIBLING_DEALS = 10;
const MIN_ORDER_LENGTH = 3;

const DEAL_SELECT = ['*', 'UF_*'];
const TASK_SELECT = ['ID', 'TITLE', 'RESPONSIBLE_ID', 'UF_CRM_TASK', 'STATUS'];

interface ILeadSignals {
    order: string | null;
    phones: string[];
    emails: string[];
    domains: string[];
    inns: string[];
}

/** Куда привёл разбор одной команды чтения. */
interface IParsedHits {
    /** Строки сделок (после JS-перепроверки). */
    dealRows: BxRow[];
    contactIds: number[];
    companyIds: number[];
    /** Ссылки на сделки сиблинг-лидов (`D_84663` / `84663`). */
    dealRefs: number[];
}

/**
 * ПОИСК РАБОТЫ КЛИЕНТА для повторной заявки — только чтение, двумя-тремя
 * batch-волнами на ВСЮ пачку лидов (ai/rules/bitrix-batch-grouping.md:
 * вызывается строго до первой записи, из общей карты команд инстанса).
 *
 * Почему не DuplicateSearchService: его кэш не различает источники с
 * одинаковыми сигналами, findbycomm игнорирует targetTypes, а кандидат не
 * несёт ответственного и закрытость сделки — здесь всё это нужно.
 *
 * САМОЗАЩИТА ФИЛЬТРОВ: каждый ряд из LIKE/точного поиска по строковым
 * полям сделки перепроверяется в JS по сырому значению. Портал, который
 * молча игнорирует фильтр (см. память о %PHONE/%EMAIL), отдаст чужие
 * строки — они отсеются, и сигнал просто не сработает. Ложных
 * присоединений это не даёт ни при какой установке полей.
 *
 * НЕ @Injectable: bitrix и portal привязаны к домену, приходят снаружи.
 */
export class RepeatWorkFinderService {
    private readonly logger = new Logger(RepeatWorkFinderService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
        private readonly innFields: IRepeatInnFields,
    ) {}

    /** Решения по каждому лиду; лид без сигналов получает kind='none'. */
    async find(
        leads: readonly IRepeatFinderLead[],
    ): Promise<Map<number, IRepeatFindOutcome>> {
        const out = new Map<number, IRepeatFindOutcome>();
        if (!leads.length) return out;

        const baseCategoryId = this.baseCategoryId();
        if (!baseCategoryId) {
            for (const lead of leads) {
                out.set(lead.leadId, {
                    resolution: { kind: 'none' },
                    openMainTasks: [],
                    warnings: [
                        'Воронка ОП не сконфигурирована — поиск повторной заявки пропущен',
                    ],
                });
            }
            return out;
        }

        const signalsByLead = new Map<number, ILeadSignals>();
        for (const lead of leads) {
            signalsByLead.set(lead.leadId, this.extractSignals(lead.row));
        }

        // === Волна 1: сигналы → сырые попадания.
        const wave1 = this.queueWave1(leads, signalsByLead, baseCategoryId);
        const flat1 = wave1.size
            ? await this.flush()
            : new Map<string, unknown>();

        // === Разбор волны 1 + сбор потребностей волны 2.
        const needs = new Map<
            number,
            Map<RepeatSignalKind, Map<string, IParsedHits>>
        >();
        for (const lead of leads) {
            needs.set(lead.leadId, this.parseWave1(lead, wave1, flat1));
        }

        // === Волна 2: клиенты и ссылки → строки сделок (глобальный дедуп).
        const dealRowById = new Map<number, BxRow>();
        this.collectDirectDealRows(needs, dealRowById);
        await this.loadWave2(needs, dealRowById, baseCategoryId);

        // === Решения.
        const joins: { leadId: number; dealId: number }[] = [];
        for (const lead of leads) {
            const buckets = this.buildBuckets(
                lead.leadId,
                needs.get(lead.leadId)!,
                dealRowById,
            );
            const resolution = resolveRepeatWork(buckets);
            out.set(lead.leadId, {
                resolution,
                openMainTasks: [],
                warnings: [],
            });
            if (resolution.kind === 'join' && resolution.mainDeal) {
                joins.push({
                    leadId: lead.leadId,
                    dealId: resolution.mainDeal.dealId,
                });
            }
        }

        // === Волна 3: открытые задачи основных сделок (только join).
        if (joins.length) {
            const taskGroupId = this.portal.getSalesTaskGroupId();
            for (const join of joins) {
                this.bitrix.batch.task.getList(
                    `rjt_${join.leadId}`,
                    {
                        UF_CRM_TASK: [`D_${join.dealId}`],
                        '!STATUS': EBXTaskStatus.COMPLETED,
                        ...(taskGroupId ? { GROUP_ID: taskGroupId } : {}),
                    } as never,
                    TASK_SELECT,
                );
            }
            const flat3 = await this.flush();
            for (const join of joins) {
                const raw = flat3.get(`rjt_${join.leadId}`) as
                    | { tasks?: BxRow[] }
                    | BxRow[]
                    | undefined;
                const tasks = Array.isArray(raw) ? raw : (raw?.tasks ?? []);
                out.get(join.leadId)!.openMainTasks = tasks;
            }
        }

        for (const [leadId, outcome] of out) {
            if (outcome.resolution.kind !== 'none') {
                this.logger.log(
                    `[repeat] lead=${leadId}: ${outcome.resolution.kind} ` +
                        `(${outcome.resolution.signal ?? '—'} ${outcome.resolution.value ?? ''})`,
                );
            }
        }
        return out;
    }

    /* ------------------------------------------------------------------ *
     * Сигналы лида
     * ------------------------------------------------------------------ */

    private extractSignals(row: BxRow): ILeadSignals {
        const phones = uniq(
            this.multifield(row.PHONE)
                .map(normalizePhone)
                .filter((value): value is string => !!value),
        ).slice(0, MAX_PHONES);
        const emails = uniq(
            this.multifield(row.EMAIL)
                .map(normalizeEmail)
                .filter((value): value is string => !!value),
        ).slice(0, MAX_EMAILS);
        const domains = uniq(
            emails
                .map(corporateEmailDomain)
                .filter((value): value is string => !!value),
        ).slice(0, MAX_DOMAINS);

        const orderName = this.fieldName('lead', 'lead_order_number');
        const orderRaw = orderName ? this.text(row[orderName]) : '';
        const order = orderRaw.length >= MIN_ORDER_LENGTH ? orderRaw : null;

        const inns = uniq([
            ...this.innFields.lead.flatMap(field =>
                this.multifield(row[field.fieldName]).flatMap(normalizeInnList),
            ),
            ...extractInnFromTitle(this.text(row.TITLE)),
            ...extractInnFromTitle(this.text(row.COMPANY_TITLE)),
        ]).slice(0, MAX_INNS);

        return { order, phones, emails, domains, inns };
    }

    /* ------------------------------------------------------------------ *
     * Волна 1
     * ------------------------------------------------------------------ */

    /** Ставит команды; возвращает карту cmd → {leadId, signal, value, verify}. */
    private queueWave1(
        leads: readonly IRepeatFinderLead[],
        signalsByLead: Map<number, ILeadSignals>,
        baseCategoryId: string,
    ): Map<
        string,
        {
            leadId: number;
            signal: RepeatSignalKind;
            value: string;
            shape: 'deals' | 'comm' | 'leads' | 'requisites' | 'companies';
            /** Имя поля сделки для JS-перепроверки LIKE/точного фильтра. */
            verifyField?: string;
        }
    > {
        const commands = new Map<
            string,
            {
                leadId: number;
                signal: RepeatSignalKind;
                value: string;
                shape: 'deals' | 'comm' | 'leads' | 'requisites' | 'companies';
                verifyField?: string;
            }
        >();
        const leadOrderName = this.fieldName('lead', 'lead_order_number');
        const leadToBaseName = this.fieldName('lead', 'to_base_sales');
        const dealOrderName = this.fieldName('deal', 'lead_order_number');
        const phonesName = this.fieldName('deal', 'op_lead_phones');
        const emailsName = this.fieldName('deal', 'op_lead_emails');

        let seq = 0;
        const queueDealList = (
            leadId: number,
            signal: RepeatSignalKind,
            value: string,
            filter: BxRow,
            verifyField?: string,
        ): void => {
            const cmd = `rj${leadId}_d${seq++}`;
            commands.set(cmd, {
                leadId,
                signal,
                value,
                shape: 'deals',
                verifyField,
            });
            this.bitrix.batch.deal.getList(
                cmd,
                { ...filter, CATEGORY_ID: baseCategoryId } as never,
                DEAL_SELECT,
            );
        };

        for (const lead of leads) {
            const signals = signalsByLead.get(lead.leadId)!;

            if (signals.order) {
                if (leadOrderName && leadToBaseName) {
                    const cmd = `rj${lead.leadId}_l${seq++}`;
                    commands.set(cmd, {
                        leadId: lead.leadId,
                        signal: 'order',
                        value: signals.order,
                        shape: 'leads',
                    });
                    this.bitrix.batch.lead.getList(
                        cmd,
                        { [leadOrderName]: signals.order } as never,
                        ['ID', leadToBaseName],
                    );
                }
                if (dealOrderName) {
                    queueDealList(
                        lead.leadId,
                        'order',
                        signals.order,
                        { [dealOrderName]: signals.order },
                        dealOrderName,
                    );
                }
            }

            for (const inn of signals.inns) {
                const cmd = `rj${lead.leadId}_r${seq++}`;
                commands.set(cmd, {
                    leadId: lead.leadId,
                    signal: 'inn',
                    value: inn,
                    shape: 'requisites',
                });
                this.bitrix.batch.requisite.getList(
                    cmd,
                    { RQ_INN: inn } as never,
                    ['ID', 'ENTITY_TYPE_ID', 'ENTITY_ID', 'RQ_INN'],
                );
                for (const field of this.innFields.deal) {
                    queueDealList(
                        lead.leadId,
                        'inn',
                        inn,
                        { [field.fieldName]: inn },
                        field.fieldName,
                    );
                }
                for (const field of this.innFields.company) {
                    const companyCmd = `rj${lead.leadId}_c${seq++}`;
                    commands.set(companyCmd, {
                        leadId: lead.leadId,
                        signal: 'inn',
                        value: inn,
                        shape: 'companies',
                        verifyField: field.fieldName,
                    });
                    this.bitrix.batch.company.getList(
                        companyCmd,
                        { [field.fieldName]: inn } as never,
                        ['ID', field.fieldName],
                    );
                }
            }

            for (const phone of signals.phones) {
                const cmd = `rj${lead.leadId}_f${seq++}`;
                commands.set(cmd, {
                    leadId: lead.leadId,
                    signal: 'phone',
                    value: phone,
                    shape: 'comm',
                });
                this.bitrix.batch.duplicate.findByComm(cmd, {
                    type: 'PHONE',
                    values: [phone],
                });
                if (phonesName) {
                    queueDealList(
                        lead.leadId,
                        'phone',
                        phone,
                        { [`%${phonesName}`]: phone },
                        phonesName,
                    );
                }
            }

            for (const email of signals.emails) {
                const cmd = `rj${lead.leadId}_f${seq++}`;
                commands.set(cmd, {
                    leadId: lead.leadId,
                    signal: 'email',
                    value: email,
                    shape: 'comm',
                });
                this.bitrix.batch.duplicate.findByComm(cmd, {
                    type: 'EMAIL',
                    values: [email],
                });
                if (emailsName) {
                    queueDealList(
                        lead.leadId,
                        'email',
                        email,
                        { [emailsName]: email },
                        emailsName,
                    );
                }
            }

            for (const domain of signals.domains) {
                if (!emailsName) continue;
                queueDealList(
                    lead.leadId,
                    'email_domain',
                    domain,
                    { [`%${emailsName}`]: `@${domain}` },
                    emailsName,
                );
            }
        }
        return commands;
    }

    /** Разбор волны 1 по лиду: signal → value → попадания. */
    private parseWave1(
        lead: IRepeatFinderLead,
        commands: ReturnType<RepeatWorkFinderService['queueWave1']>,
        flat: Map<string, unknown>,
    ): Map<RepeatSignalKind, Map<string, IParsedHits>> {
        const result = new Map<RepeatSignalKind, Map<string, IParsedHits>>();
        const hitsOf = (
            signal: RepeatSignalKind,
            value: string,
        ): IParsedHits => {
            const byValue =
                result.get(signal) ?? new Map<string, IParsedHits>();
            result.set(signal, byValue);
            const hits =
                byValue.get(value) ??
                ({
                    dealRows: [],
                    contactIds: [],
                    companyIds: [],
                    dealRefs: [],
                } as IParsedHits);
            byValue.set(value, hits);
            return hits;
        };
        const leadToBaseName = this.fieldName('lead', 'to_base_sales');

        for (const [cmd, meta] of commands) {
            if (meta.leadId !== lead.leadId) continue;
            const raw = flat.get(cmd);
            if (raw === undefined) continue;
            const hits = hitsOf(meta.signal, meta.value);

            if (meta.shape === 'deals') {
                for (const row of this.rowsOf(raw)) {
                    if (
                        meta.verifyField &&
                        !this.rowContains(
                            row[meta.verifyField],
                            meta.value,
                            meta.signal,
                        )
                    ) {
                        continue;
                    }
                    hits.dealRows.push(row);
                }
                continue;
            }
            if (meta.shape === 'companies') {
                for (const row of this.rowsOf(raw)) {
                    const id = this.toId(row.ID);
                    if (id) hits.companyIds.push(id);
                }
                continue;
            }
            if (meta.shape === 'comm') {
                const byType = (raw ?? {}) as Record<string, unknown>;
                for (const id of this.idList(byType.CONTACT)) {
                    hits.contactIds.push(id);
                }
                for (const id of this.idList(byType.COMPANY)) {
                    hits.companyIds.push(id);
                }
                continue;
            }
            if (meta.shape === 'requisites') {
                for (const row of this.rowsOf(raw)) {
                    const ownerId = this.toId(row.ENTITY_ID);
                    if (!ownerId) continue;
                    if (String(row.ENTITY_TYPE_ID) === '4') {
                        hits.companyIds.push(ownerId);
                    } else if (String(row.ENTITY_TYPE_ID) === '3') {
                        hits.contactIds.push(ownerId);
                    }
                }
                continue;
            }
            // leads: сиблинги по номеру заявки → ссылки на их сделки.
            for (const row of this.rowsOf(raw)) {
                if (this.toId(row.ID) === lead.leadId) continue;
                if (!leadToBaseName) continue;
                const refs = Array.isArray(row[leadToBaseName])
                    ? (row[leadToBaseName] as unknown[])
                    : [row[leadToBaseName]];
                for (const ref of refs) {
                    const id = this.toId(ref);
                    if (id) hits.dealRefs.push(id);
                }
            }
        }
        return result;
    }

    /* ------------------------------------------------------------------ *
     * Волна 2
     * ------------------------------------------------------------------ */

    /** Прямые попадания в сделки волны 1 — сразу в общий пул строк. */
    private collectDirectDealRows(
        needs: Map<number, Map<RepeatSignalKind, Map<string, IParsedHits>>>,
        dealRowById: Map<number, BxRow>,
    ): void {
        for (const byLead of needs.values()) {
            for (const byValue of byLead.values()) {
                for (const hits of byValue.values()) {
                    for (const row of hits.dealRows) {
                        const id = this.toId(row.ID);
                        if (id && !dealRowById.has(id)) {
                            dealRowById.set(id, row);
                        }
                    }
                }
            }
        }
    }

    /** Дочитывает сделки клиентов и сиблинг-ссылок (глобальный дедуп). */
    private async loadWave2(
        needs: Map<number, Map<RepeatSignalKind, Map<string, IParsedHits>>>,
        dealRowById: Map<number, BxRow>,
        baseCategoryId: string,
    ): Promise<void> {
        const companyIds = new Set<number>();
        const contactIds = new Set<number>();
        const dealIds = new Set<number>();
        for (const byLead of needs.values()) {
            for (const byValue of byLead.values()) {
                for (const hits of byValue.values()) {
                    hits.companyIds
                        .slice(0, MAX_COMPANIES)
                        .forEach(id => companyIds.add(id));
                    hits.contactIds
                        .slice(0, MAX_CONTACTS)
                        .forEach(id => contactIds.add(id));
                    hits.dealRefs
                        .slice(0, MAX_SIBLING_DEALS)
                        .forEach(id => dealIds.add(id));
                }
            }
        }
        for (const id of dealRowById.keys()) dealIds.delete(id);

        if (!companyIds.size && !contactIds.size && !dealIds.size) return;

        for (const id of companyIds) {
            this.bitrix.batch.deal.getList(
                `rjw2_co_${id}`,
                { COMPANY_ID: id, CATEGORY_ID: baseCategoryId } as never,
                DEAL_SELECT,
            );
        }
        for (const id of contactIds) {
            this.bitrix.batch.deal.getList(
                `rjw2_ct_${id}`,
                { CONTACT_ID: id, CATEGORY_ID: baseCategoryId } as never,
                DEAL_SELECT,
            );
        }
        for (const id of dealIds) {
            this.bitrix.batch.deal.get(`rjw2_id_${id}`, id);
        }
        const flat = await this.flush();

        const push = (raw: unknown): void => {
            for (const row of this.rowsOf(raw)) {
                const id = this.toId(row.ID);
                // Сиблинг-ссылки могут вести в чужие воронки — отсекаем.
                if (!id || String(row.CATEGORY_ID) !== baseCategoryId) continue;
                if (!dealRowById.has(id)) dealRowById.set(id, row);
            }
        };
        for (const id of companyIds) push(flat.get(`rjw2_co_${id}`));
        for (const id of contactIds) push(flat.get(`rjw2_ct_${id}`));
        for (const id of dealIds) push(flat.get(`rjw2_id_${id}`));

        // Клиентские попадания превращаем в сделки клиентов.
        const dealsByCompany = new Map<number, number[]>();
        const dealsByContact = new Map<number, number[]>();
        for (const [dealId, row] of dealRowById) {
            const companyId = this.toId(row.COMPANY_ID);
            if (companyId) {
                dealsByCompany.set(companyId, [
                    ...(dealsByCompany.get(companyId) ?? []),
                    dealId,
                ]);
            }
        }
        for (const id of contactIds) {
            const ids = this.rowsOf(flat.get(`rjw2_ct_${id}`))
                .map(row => this.toId(row.ID))
                .filter((dealId): dealId is number => !!dealId);
            dealsByContact.set(id, ids);
        }
        for (const byLead of needs.values()) {
            for (const byValue of byLead.values()) {
                for (const hits of byValue.values()) {
                    for (const companyId of hits.companyIds) {
                        for (const dealId of dealsByCompany.get(companyId) ??
                            []) {
                            hits.dealRefs.push(dealId);
                        }
                    }
                    for (const contactId of hits.contactIds) {
                        for (const dealId of dealsByContact.get(contactId) ??
                            []) {
                            hits.dealRefs.push(dealId);
                        }
                    }
                }
            }
        }
    }

    /* ------------------------------------------------------------------ */

    private buildBuckets(
        leadId: number,
        byLead: Map<RepeatSignalKind, Map<string, IParsedHits>>,
        dealRowById: Map<number, BxRow>,
    ): IRepeatSignalCandidates[] {
        const buckets: IRepeatSignalCandidates[] = [];
        for (const [signal, byValue] of byLead) {
            for (const [value, hits] of byValue) {
                const dealIds = uniq([
                    ...hits.dealRows
                        .map(row => this.toId(row.ID))
                        .filter((id): id is number => !!id),
                    ...hits.dealRefs,
                ]);
                const deals = dealIds
                    .map(id => dealRowById.get(id))
                    .filter((row): row is BxRow => !!row)
                    .map(row => this.dealInfo(row));
                buckets.push({
                    signal,
                    value,
                    deals,
                    contactIds: uniq(hits.contactIds),
                    companyIds: uniq(hits.companyIds),
                });
            }
        }
        return buckets;
    }

    private dealInfo(row: BxRow): IRepeatDealInfo {
        return {
            dealId: this.toId(row.ID) ?? 0,
            closed: row.CLOSED === 'Y' || row.CLOSED === true,
            stageId: this.text(row.STAGE_ID),
            responsibleId: this.toId(row.ASSIGNED_BY_ID),
            companyId: this.toId(row.COMPANY_ID),
            title: this.text(row.TITLE) || `#${String(row.ID)}`,
            row,
        };
    }

    /** JS-перепроверка: ряд из фильтра действительно содержит значение. */
    private rowContains(
        raw: unknown,
        value: string,
        signal: RepeatSignalKind,
    ): boolean {
        const values = this.multifield(raw);
        if (signal === 'phone') {
            return values.some(item => normalizePhone(item) === value);
        }
        if (signal === 'email') {
            return values.some(item => normalizeEmail(item) === value);
        }
        if (signal === 'email_domain') {
            return values.some(item =>
                (normalizeEmail(item) ?? '').endsWith(`@${value}`),
            );
        }
        // order / inn: точное значение либо элемент списка.
        return values.some(
            item =>
                item.trim() === value || normalizeInnList(item).includes(value),
        );
    }

    private baseCategoryId(): string | null {
        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        return category ? String(category.bitrixId) : null;
    }

    private fieldName(
        entity: 'lead' | 'deal',
        code: keyof typeof PBX_SALES_EVENT_FIELD_CODES,
    ): string | null {
        const field = this.portal.getEntityFieldByCode(
            entity,
            PBX_SALES_EVENT_FIELD_CODES[code],
        );
        return field ? this.portal.getFieldBitrixId(field) : null;
    }

    private async flush(): Promise<Map<string, unknown>> {
        const flat = new Map<string, unknown>();
        for (const chunk of await this.bitrix.api.callBatchWithConcurrency(1)) {
            for (const [cmd, value] of Object.entries(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                flat.set(cmd, value);
            }
        }
        return flat;
    }

    private rowsOf(raw: unknown): BxRow[] {
        if (Array.isArray(raw)) {
            return raw.filter(
                (row): row is BxRow => !!row && typeof row === 'object',
            );
        }
        if (raw && typeof raw === 'object') {
            const container = raw as { items?: unknown; result?: unknown };
            if (Array.isArray(container.items)) {
                return this.rowsOf(container.items);
            }
            if (Array.isArray(container.result)) {
                return this.rowsOf(container.result);
            }
            // deal.get отдаёт одиночную строку.
            if ('ID' in (raw as BxRow)) return [raw as BxRow];
        }
        return [];
    }

    private idList(raw: unknown): number[] {
        if (!Array.isArray(raw)) return [];
        return raw
            .map(value => this.toId(value))
            .filter((id): id is number => !!id);
    }

    /** `D_84663` / `84663` / 84663 → 84663; мусор → null. */
    private toId(raw: unknown): number | null {
        if (typeof raw !== 'string' && typeof raw !== 'number') return null;
        const match = /(\d+)\s*$/.exec(String(raw).trim());
        const id = match ? Number(match[1]) : NaN;
        return Number.isInteger(id) && id > 0 ? id : null;
    }

    private text(raw: unknown): string {
        if (typeof raw === 'string') return raw.trim();
        if (typeof raw === 'number' || typeof raw === 'bigint') {
            return String(raw);
        }
        return '';
    }

    private multifield(raw: unknown): string[] {
        if (raw === null || raw === undefined || raw === false) return [];
        const items = Array.isArray(raw) ? raw : [raw];
        return items
            .flatMap(item => {
                if (item && typeof item === 'object') {
                    const value = (item as { VALUE?: unknown }).VALUE;
                    return typeof value === 'string' ? [value] : [];
                }
                // Одиночное строковое поле могло хранить список через запятую.
                return typeof item === 'string'
                    ? item.split(',').map(part => part.trim())
                    : typeof item === 'number'
                      ? [String(item)]
                      : [];
            })
            .filter(Boolean);
    }
}
