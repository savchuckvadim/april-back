import { bxFieldId, bxFieldText } from '@lib/shared/lib/utils';
import {
    communicationKey,
    ILeadClientBitrix,
    ILeadClientPair,
    ILeadClientRef,
    LeadClientKind,
    multiItems,
    resultOf,
    Row,
} from './lead-client.types';

const COMMUNICATION_FIELDS = ['PHONE', 'EMAIL'] as const;

/**
 * Метка «клиент создан из лида» — в полях внешнего источника.
 * `LEAD_ID` у контакта и компании только для чтения (crm.*.fields,
 * проверено 17.09.2026): записанный, он молча отбрасывается.
 */
const ORIGINATOR = 'april-lead';

/**
 * Клиент для голого лида: найти созданного раньше или создать и привязать.
 *
 * ПОЧЕМУ ТАКОЙ ПОРЯДОК (опыт 17.09.2026, ai/tasks/2026-09-17-lead-link-probe.md):
 * Битрикс сам копирует телефоны и почту лида в клиента, которого ставят лиду
 * `crm.lead.update`, — но только пока лид не «повторный». Поэтому клиент
 * создаётся ПУСТЫМ, привязывается, перечитывается, и недостающее дописываем
 * сами. Созданный сразу с телефоном клиент мог бы получить его дважды.
 *
 * Идемпотентность: главная — лид уже привязан к клиенту и не голый;
 * запасная (падение между созданием и привязкой) — метка внешнего источника
 * `ORIGINATOR_ID` + `ORIGIN_ID = id лида`, по ней ищем перед созданием.
 */
export class LeadClientFactory {
    constructor(private readonly bitrix: ILeadClientBitrix) {}

    /**
     * Клиент лида.
     *
     * - `contact`: создаётся только у ГОЛОГО лида (ни компании, ни контакта);
     * - `company`: создаётся у лида без компании, даже если контакт уже есть —
     *   так отдел, работающий с организациями, получает компанию, а контакт
     *   остаётся её сотрудником. Если компания есть у сделки, лид
     *   привязывается к ней, а не к новой: дубль клиента хуже.
     */
    async ensure(
        lead: Row,
        deal: Row,
        dealCompanyId: number,
        kind: LeadClientKind,
        created: ILeadClientRef[],
    ): Promise<ILeadClientPair> {
        const contactId = bxFieldId(lead.CONTACT_ID) ?? 0;
        const companyId = bxFieldId(lead.COMPANY_ID) ?? 0;
        const needed =
            kind === 'company' ? !companyId : !companyId && !contactId;
        if (!needed) return { contactId, companyId, isNew: false };
        const leadId = Number(lead.ID);

        if (kind === 'company') {
            const reused =
                dealCompanyId || (await this.findCreatedFrom(kind, leadId));
            const id =
                reused || (await this.create(kind, lead, deal, dealCompanyId));
            await this.bindLead(leadId, { COMPANY_ID: id });
            await this.completeCommunications(kind, id, lead);
            if (contactId) await this.linkContactToCompany(contactId, id);
            if (id !== dealCompanyId) {
                created.push({ leadId, type: kind, id, reused: !!reused });
            }
            return { contactId, companyId: id, isNew: true };
        }

        const existing = await this.findCreatedFrom(kind, leadId);
        const id =
            existing ?? (await this.create(kind, lead, deal, dealCompanyId));
        await this.bindLead(leadId, { CONTACT_ID: id });
        await this.completeCommunications(kind, id, lead);
        created.push({ leadId, type: kind, id, reused: existing !== null });
        return { contactId: id, companyId: 0, isNew: true };
    }

    /**
     * Контакт лида — сотрудник его компании: цепочка «сделка → компания →
     * контакт», о которой просил владелец.
     */
    private async linkContactToCompany(
        contactId: number,
        companyId: number,
    ): Promise<void> {
        await this.bitrix.api.call('crm.contact.company.add', {
            id: contactId,
            fields: { COMPANY_ID: companyId },
        });
    }

    /** Клиент, созданный из этого лида прошлым прогоном. */
    private async findCreatedFrom(
        kind: LeadClientKind,
        leadId: number,
    ): Promise<number | null> {
        const rows = resultOf(
            await this.bitrix.api.call(`crm.${kind}.list`, {
                filter: {
                    ORIGINATOR_ID: ORIGINATOR,
                    ORIGIN_ID: String(leadId),
                },
                select: ['ID'],
                order: { ID: 'ASC' },
            }),
        );
        const first = Array.isArray(rows)
            ? (rows[0] as Row | undefined)
            : undefined;
        return first ? bxFieldId(first.ID) : null;
    }

    private async create(
        kind: LeadClientKind,
        lead: Row,
        deal: Row,
        dealCompanyId: number,
    ): Promise<number> {
        const common: Row = {
            ASSIGNED_BY_ID:
                bxFieldId(deal.ASSIGNED_BY_ID) ??
                bxFieldId(lead.ASSIGNED_BY_ID),
            ORIGINATOR_ID: ORIGINATOR,
            ORIGIN_ID: String(lead.ID),
            SOURCE_ID: bxFieldText(lead.SOURCE_ID) ?? undefined,
            OPENED: 'Y',
        };
        const fields: Row =
            kind === 'contact'
                ? {
                      ...common,
                      ...this.personName(lead),
                      COMPANY_ID: dealCompanyId || undefined,
                  }
                : { ...common, TITLE: this.companyTitle(lead) };
        const id = bxFieldId(
            resultOf(await this.bitrix.api.call(`crm.${kind}.add`, { fields })),
        );
        if (!id) {
            throw new Error(`Лид ${String(lead.ID)}: ${kind} не создан`);
        }
        return id;
    }

    /** ФИО из лида; ФИО нет — название, чтобы контакт не был безымянным. */
    private personName(lead: Row): Row {
        const name = bxFieldText(lead.NAME);
        const lastName = bxFieldText(lead.LAST_NAME);
        const secondName = bxFieldText(lead.SECOND_NAME);
        if (name || lastName || secondName) {
            return { NAME: name, LAST_NAME: lastName, SECOND_NAME: secondName };
        }
        return { NAME: this.companyTitle(lead) };
    }

    private companyTitle(lead: Row): string {
        return (
            bxFieldText(lead.COMPANY_TITLE) ??
            bxFieldText(lead.TITLE) ??
            `Лид ${String(lead.ID)}`
        );
    }

    private async bindLead(leadId: number, fields: Row): Promise<void> {
        await this.bitrix.api.call('crm.lead.update', { id: leadId, fields });
    }

    /** Дописать клиенту телефоны и почты лида, которых у него нет. */
    private async completeCommunications(
        kind: LeadClientKind,
        clientId: number,
        lead: Row,
    ): Promise<void> {
        const client = resultOf(
            await this.bitrix.api.call(`crm.${kind}.get`, { id: clientId }),
        ) as Row | undefined;
        const fields: Row = {};
        for (const field of COMMUNICATION_FIELDS) {
            const have = new Set(
                multiItems(client?.[field]).map(item =>
                    communicationKey(item.VALUE),
                ),
            );
            const missing = multiItems(lead[field]).filter(
                item => !have.has(communicationKey(item.VALUE)),
            );
            if (missing.length) fields[field] = missing;
        }
        if (Object.keys(fields).length) {
            await this.bitrix.api.call(`crm.${kind}.update`, {
                id: clientId,
                fields,
            });
        }
    }
}
