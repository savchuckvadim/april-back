import { BitrixService } from '@/modules/bitrix';
import { BitrixOwnerTypeId } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { LeadClosingReason, LeadClosingTarget } from './lead-closing.decision';
import { LeadClosingCase } from './lead-closing.reader';

/** Что сделано со связью «Лид» у сделки. */
export const LEAD_CLOSING_LINK_ACTIONS = [
    /** Поставили лид в пустое поле сделки. */
    'set',
    /** Лид там уже стоял. */
    'already',
    /**
     * «Лид» сделки занят другим лидом (у сделки он один) — лид поставлен в
     * «Лид» компании (решение владельца 14.11.2026).
     */
    'company',
    /** Занято и у сделки, и у компании — не перетираем. */
    'taken',
    /** Связь не нужна. */
    'none',
] as const;
export type LeadClosingLinkAction = (typeof LEAD_CLOSING_LINK_ACTIONS)[number];

/** Строка журнала: всё, что нужно для проверки и отката. */
export interface LeadClosingJournalEntry {
    leadId: number;
    reason: LeadClosingReason;
    target: LeadClosingTarget;
    statusBefore: string;
    statusAfter: string;
    dealId: number;
    linkDealId: number | null;
    linkAction: LeadClosingLinkAction;
    /** Куда фактически пишется «Лид»: сделка (2) или компания (4). */
    linkEntityTypeId: number | null;
    linkEntityId: number | null;
    linkLeadBefore: number;
    /**
     * Компания, поставленная лиду (у лида её не было, а связь ушла в
     * компанию клиента); null — компанию лида не трогали. Откат — 0.
     */
    leadCompanySet?: number | null;
    leadCmd: string | null;
    linkCmd: string | null;
}

const TARGET_TITLES: Record<LeadClosingTarget, string> = {
    lead_converted: '«Сконвертирован» (lead_converted)',
    lead_junk: '«Некачественный лид» (lead_junk)',
    lead_apology: '«Не состоялась» (lead_apology)',
};

/**
 * Ставит в batch закрытие лидов и связь «Лид» у сделки — и откат по журналу.
 *
 * Команды независимы (без $result), поэтому пишутся прямо в batch-очередь
 * инстанса Битрикса; отправляет вызывающий (callBatchWithConcurrency) —
 * см. ai/rules/bitrix-batch-grouping.md, п. 1.
 *
 * «Лид» сделки пишется через crm.item.update (`leadId`): в crm.deal.update
 * поле LEAD_ID только для чтения и молча отбрасывается (garant, 13.11.2026 —
 * из 12 836 сделок перевода поле стояло у одной).
 *
 * НЕ @Injectable: создаётся `new` с инстансом Битрикса конкретного портала.
 */
export class LeadClosingWriter {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /** STATUS_ID портала для нужных целей; несопоставленная цель — ошибка. */
    resolveStatuses(
        targets: Iterable<LeadClosingTarget>,
    ): Map<LeadClosingTarget, string> {
        const statuses = new Map<LeadClosingTarget, string>();
        for (const target of targets) {
            const statusId = this.portal.getLeadStatusIdByCode(target);
            if (!statusId) {
                throw new Error(
                    `Статус лида ${TARGET_TITLES[target]} не сопоставлен в админке портала`,
                );
            }
            statuses.set(target, statusId);
        }
        return statuses;
    }

    queue(cases: LeadClosingCase[]): LeadClosingJournalEntry[] {
        const active = cases.filter(item => item.decision.target !== null);
        const statuses = this.resolveStatuses(
            new Set(
                active.map(item => item.decision.target as LeadClosingTarget),
            ),
        );
        const claimed = {
            deals: new Set<number>(),
            companies: new Set<number>(),
        };
        const entries: LeadClosingJournalEntry[] = [];
        for (const item of active) {
            const target = item.decision.target as LeadClosingTarget;
            const { lead, decision } = item;
            const statusAfter = statuses.get(target) as string;
            const linkAction = this.linkAction(item, claimed);
            const linkTo = this.linkTarget(item, linkAction);
            // «Сконвертирован» в клиента: лиду без компании — компания
            // клиента (как ручные конвертации владельца 15.11.2026).
            const leadCompanySet =
                target === 'lead_converted' &&
                lead.companyId === 0 &&
                item.linkCompany
                    ? item.linkCompany.id
                    : null;
            const entry: LeadClosingJournalEntry = {
                leadId: lead.id,
                reason: decision.reason,
                target,
                statusBefore: lead.statusId,
                statusAfter,
                dealId: lead.dealId,
                linkDealId: decision.linkDealId,
                linkAction,
                linkEntityTypeId: linkTo?.entityTypeId ?? null,
                linkEntityId: linkTo?.id ?? null,
                linkLeadBefore: item.linkDealLeadId,
                leadCompanySet,
                leadCmd:
                    lead.statusId === statusAfter && leadCompanySet === null
                        ? null
                        : `lc_lead_${lead.id}`,
                linkCmd: linkTo ? `lc_link_${lead.id}` : null,
            };
            this.queueEntry(entry, false);
            entries.push(entry);
        }
        return entries;
    }

    /** Откат строк журнала: прежний статус лида и пустой «Лид» у сделки. */
    queueRollback(entries: LeadClosingJournalEntry[]): void {
        for (const entry of entries) this.queueEntry(entry, true);
    }

    private linkAction(
        item: LeadClosingCase,
        claimed: { deals: Set<number>; companies: Set<number> },
    ): LeadClosingLinkAction {
        const dealId = item.decision.linkDealId;
        if (dealId !== null) {
            if (item.linkDealLeadId === item.lead.id) return 'already';
            if (item.linkDealLeadId === 0 && !claimed.deals.has(dealId)) {
                claimed.deals.add(dealId);
                return 'set';
            }
        }
        // Сделки связи нет («работа в другом отделе») или её «Лид» занят —
        // связь уходит в компанию клиента.
        const company = item.linkCompany;
        if (!company) return dealId === null ? 'none' : 'taken';
        if (company.leadId === item.lead.id) return 'already';
        if (company.leadId > 0 || claimed.companies.has(company.id)) {
            return 'taken';
        }
        claimed.companies.add(company.id);
        return 'company';
    }

    private linkTarget(
        item: LeadClosingCase,
        action: LeadClosingLinkAction,
    ): { entityTypeId: number; id: number } | null {
        if (action === 'set' && item.decision.linkDealId !== null) {
            return {
                entityTypeId: BitrixOwnerTypeId.DEAL,
                id: item.decision.linkDealId,
            };
        }
        if (action === 'company' && item.linkCompany) {
            return {
                entityTypeId: BitrixOwnerTypeId.COMPANY,
                id: item.linkCompany.id,
            };
        }
        return null;
    }

    private queueEntry(
        entry: LeadClosingJournalEntry,
        rollback: boolean,
    ): void {
        const suffix = rollback ? '_rb' : '';
        if (entry.leadCmd) {
            const statusId = rollback ? entry.statusBefore : entry.statusAfter;
            const company = entry.leadCompanySet
                ? { COMPANY_ID: String(rollback ? 0 : entry.leadCompanySet) }
                : {};
            this.bitrix.batch.lead.update(
                `${entry.leadCmd}${suffix}`,
                entry.leadId,
                { STATUS_ID: statusId, ...company },
            );
        }
        if (entry.linkCmd && entry.linkEntityTypeId && entry.linkEntityId) {
            this.bitrix.batch.item.update(
                `${entry.linkCmd}${suffix}`,
                entry.linkEntityId,
                entry.linkEntityTypeId,
                // 0, а не null: null выпадает из batch-запроса, и Битрикс
                // отвечает «Could not find value for parameter {fields}».
                { leadId: rollback ? 0 : entry.leadId },
            );
        }
    }
}
