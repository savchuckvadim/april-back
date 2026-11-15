import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    PBX_DEAL_SALES_BASE_STAGES,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    decideLeadClosing,
    LeadClosingDecision,
    LeadClosingInput,
} from './lead-closing.decision';
import { LeadJoinedDealsReader } from './lead-closing-joined.reader';
import { LeadCompanyLinkReader } from './lead-closing-company.reader';

/** Лид, который нужно закрыть по итогу работы. */
export interface LeadClosingLead {
    id: number;
    statusId: string;
    companyId: number;
    contactId: number;
    /** Сделка-работа из ссылки лида `to_base_sales`. */
    dealId: number;
}

export interface LeadClosingCase {
    lead: LeadClosingLead;
    input: LeadClosingInput;
    decision: LeadClosingDecision;
    /** Кто сейчас стоит в поле «Лид» у сделки связи (0 — никто). */
    linkDealLeadId: number;
    /** Ответственный сделки связи (0 — связи нет). */
    linkDealAssignedId: number;
    /**
     * Запасная связь, если «Лид» сделки занят: компания лида (иначе сделки)
     * и кто сейчас стоит в её «Лид» (0 — никто).
     */
    linkCompany: { id: number; leadId: number } | null;
}

type DecidedCase = Omit<LeadClosingCase, 'linkCompany'> & {
    companyId: number;
};

const DEAL_SELECT = [
    'ID',
    'CATEGORY_ID',
    'STAGE_ID',
    'CLOSED',
    'COMPANY_ID',
    'CONTACT_ID',
    'LEAD_ID',
    'ASSIGNED_BY_ID',
    'DATE_MODIFY',
];
const CHUNK = 50;
const S = PBX_DEAL_SALES_BASE_STAGE_CODE;
/** Стадии, у которых ищем работу клиента в других сделках. */
const LOOKUP_STAGES: ReadonlySet<PbxDealSalesBaseStageCode> = new Set([
    S.apology,
    S.duplicate,
]);
/** Закрытые стадии «ОП Основная», кроме «Успеха». */
const DEAD_STAGES: ReadonlySet<PbxDealSalesBaseStageCode> = new Set([
    S.fail,
    S.apology,
    S.notCa,
    S.notCall,
    S.duplicate,
]);

const num = (value: unknown): number => Number(value ?? 0) || 0;
const chunks = <T>(items: T[]): T[][] =>
    Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) =>
        items.slice(i * CHUNK, (i + 1) * CHUNK),
    );

/**
 * Читает всё, что нужно правилу закрытия: сделку-работу каждого лида и —
 * для «Не состоялась», «Дубля» и удалённых сделок — остальные сделки
 * клиента (по компании и по контакту), а для удалённых — ещё и сделки, где
 * лид записан присоединённым (LeadJoinedDealsReader).
 *
 * НЕ @Injectable: создаётся `new` с инстансом Битрикса конкретного портала.
 */
export class LeadClosingReader {
    private readonly baseCategoryId: string;
    private readonly stageCodes = new Map<string, PbxDealSalesBaseStageCode>();
    private readonly joined: LeadJoinedDealsReader;
    private readonly companies: LeadCompanyLinkReader;

    constructor(
        private readonly bitrix: BitrixService,
        portal: PortalModel,
    ) {
        const category = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) {
            throw new Error('На портале не настроена воронка «ОП Основная»');
        }
        this.baseCategoryId = String(category.bitrixId);
        this.joined = new LeadJoinedDealsReader(bitrix, portal);
        this.companies = new LeadCompanyLinkReader(bitrix);
        const known = new Set<string>(
            PBX_DEAL_SALES_BASE_STAGES.map(stage => stage.code),
        );
        for (const stage of category.stages) {
            if (!known.has(stage.code)) continue;
            this.stageCodes.set(
                `C${this.baseCategoryId}:${stage.bitrixId}`,
                stage.code as PbxDealSalesBaseStageCode,
            );
        }
    }

    async read(leads: LeadClosingLead[]): Promise<LeadClosingCase[]> {
        const decided = await this.decide(leads);
        const companyLeads = await this.companies.read(
            decided
                .filter(item => item.decision.target !== null)
                .map(item => item.companyId),
        );
        return decided.map(({ companyId, ...item }) => {
            const leadId = companyLeads.get(companyId);
            return {
                ...item,
                linkCompany:
                    leadId === undefined ? null : { id: companyId, leadId },
            };
        });
    }

    /** Решение по лиду + компания для запасной связи (лида, иначе сделки). */
    private async decide(leads: LeadClosingLead[]): Promise<DecidedCase[]> {
        const deals = await this.dealsBy('ID', [
            ...new Set(leads.map(lead => lead.dealId).filter(Boolean)),
        ]);
        const byId = new Map(deals.map(deal => [num(deal.ID), deal]));
        const lookup = leads.filter(lead => this.needsLookup(byId, lead));
        const clientDeals = await this.clientDeals(lookup, byId);
        const joined = await this.joined.read(
            lookup.filter(lead => !byId.has(lead.dealId)).map(lead => lead.id),
            DEAL_SELECT,
        );

        return leads.map(lead => {
            const deal = byId.get(lead.dealId) ?? null;
            const byClient = this.othersOf(lead, deal, clientDeals);
            const others = [
                ...byClient,
                ...(joined.get(lead.id) ?? []).filter(
                    d =>
                        num(d.ID) !== lead.dealId &&
                        !byClient.some(c => num(c.ID) === num(d.ID)),
                ),
            ];
            const live = this.freshest(others.filter(d => this.isLiveBase(d)));
            const input: LeadClosingInput = {
                deal: deal
                    ? { id: num(deal.ID), stage: this.stageOf(deal) }
                    : null,
                liveBaseDealId: live ? num(live.ID) : null,
                hasOpenWorkElsewhere: others.some(
                    d =>
                        String(d.CATEGORY_ID) !== this.baseCategoryId &&
                        d.CLOSED === 'N',
                ),
            };
            const decision = decideLeadClosing(input);
            const linkDeal =
                decision.linkDealId === null
                    ? undefined
                    : (byId.get(decision.linkDealId) ??
                      others.find(d => num(d.ID) === decision.linkDealId));
            return {
                lead,
                input,
                decision,
                linkDealLeadId: num(linkDeal?.LEAD_ID),
                linkDealAssignedId: num(linkDeal?.ASSIGNED_BY_ID),
                companyId: lead.companyId || num(linkDeal?.COMPANY_ID),
            };
        });
    }

    stageOf(deal: IBXDeal): PbxDealSalesBaseStageCode | null {
        return this.stageCodes.get(String(deal.STAGE_ID)) ?? null;
    }

    private needsLookup(
        byId: Map<number, IBXDeal>,
        lead: LeadClosingLead,
    ): boolean {
        if (!lead.dealId) return false;
        const deal = byId.get(lead.dealId);
        if (!deal) return true;
        const stage = this.stageOf(deal);
        return stage !== null && LOOKUP_STAGES.has(stage);
    }

    private isLiveBase(deal: IBXDeal): boolean {
        if (String(deal.CATEGORY_ID) !== this.baseCategoryId) return false;
        const stage = this.stageOf(deal);
        return stage !== null && !DEAD_STAGES.has(stage);
    }

    private freshest(deals: IBXDeal[]): IBXDeal | null {
        const sorted = [...deals].sort(
            (a, b) =>
                String(b.DATE_MODIFY).localeCompare(String(a.DATE_MODIFY)) ||
                num(b.ID) - num(a.ID),
        );
        return sorted[0] ?? null;
    }

    /** Сделки клиента (кроме самой сделки-работы) по компании и контакту. */
    private othersOf(
        lead: LeadClosingLead,
        deal: IBXDeal | null,
        clientDeals: IBXDeal[],
    ): IBXDeal[] {
        const companies = new Set(
            [lead.companyId, num(deal?.COMPANY_ID)].filter(Boolean),
        );
        const contacts = new Set(
            [lead.contactId, num(deal?.CONTACT_ID)].filter(Boolean),
        );
        return clientDeals.filter(
            d =>
                num(d.ID) !== lead.dealId &&
                (companies.has(num(d.COMPANY_ID)) ||
                    contacts.has(num(d.CONTACT_ID))),
        );
    }

    private async clientDeals(
        lookup: LeadClosingLead[],
        byId: Map<number, IBXDeal>,
    ): Promise<IBXDeal[]> {
        const companies = new Set<number>();
        const contacts = new Set<number>();
        for (const lead of lookup) {
            const deal = byId.get(lead.dealId);
            [lead.companyId, num(deal?.COMPANY_ID)]
                .filter(Boolean)
                .forEach(id => companies.add(id));
            [lead.contactId, num(deal?.CONTACT_ID)]
                .filter(Boolean)
                .forEach(id => contacts.add(id));
        }
        const found = [
            ...(await this.dealsBy('COMPANY_ID', [...companies])),
            ...(await this.dealsBy('CONTACT_ID', [...contacts])),
        ];
        return [...new Map(found.map(deal => [num(deal.ID), deal])).values()];
    }

    private async dealsBy(
        key: 'ID' | 'COMPANY_ID' | 'CONTACT_ID',
        ids: number[],
    ): Promise<IBXDeal[]> {
        const result: IBXDeal[] = [];
        for (const chunk of chunks(ids)) {
            result.push(
                ...(await this.bitrix.deal.all(
                    { [`@${key}`]: chunk },
                    DEAL_SELECT,
                )),
            );
        }
        return result;
    }
}
