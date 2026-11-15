import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { dealLeadLinkKey } from '../cold-hook-v2/lib/deal-link-fields';

const BATCH_LIMIT = 50;

/**
 * Сделки, в которых лид записан ссылкой «из лида» или в «присоединённых
 * лидах». Нужны лидам, чья сделка-работа удалена: повторную заявку
 * присоединяют к открытой работе, а её собственную сделку потом сносят
 * (garant 280951 → 26951, 14.11.2026). По компании такую работу не найти —
 * у повторной заявки бывает своя карточка-дубль компании.
 *
 * НЕ @Injectable: создаётся `new` с инстансом Битрикса конкретного портала.
 */
export class LeadJoinedDealsReader {
    private readonly keys: string[];

    constructor(
        private readonly bitrix: BitrixService,
        portal: PortalModel,
    ) {
        this.keys = [
            dealLeadLinkKey(portal, 'deal_joined_leads'),
            dealLeadLinkKey(portal, 'deal_from_lead_id'),
        ].filter((key): key is string => key !== null);
    }

    /** Лид → сделки, где он записан (без дублей). */
    async read(
        leadIds: number[],
        select: string[],
    ): Promise<Map<number, IBXDeal[]>> {
        const found = new Map<number, Map<number, IBXDeal>>();
        const commands = leadIds.flatMap(leadId =>
            this.keys.map((key, index) => ({
                leadId,
                key,
                cmd: `jl_${leadId}_${index}`,
            })),
        );
        for (let i = 0; i < commands.length; i += BATCH_LIMIT) {
            const part = commands.slice(i, i + BATCH_LIMIT);
            for (const { leadId, key, cmd } of part) {
                this.bitrix.batch.deal.getList(
                    cmd,
                    { [key]: `L_${leadId}` },
                    select,
                );
            }
            const results = await this.bitrix.api.callBatchWithConcurrency(1);
            for (const { leadId, cmd } of part) {
                for (const deal of this.pick(results, cmd)) {
                    const byId =
                        found.get(leadId) ?? new Map<number, IBXDeal>();
                    byId.set(Number(deal.ID), deal);
                    found.set(leadId, byId);
                }
            }
        }
        return new Map(
            [...found.entries()].map(([leadId, byId]) => [
                leadId,
                [...byId.values()],
            ]),
        );
    }

    private pick(
        results: IBitrixBatchResponseResult[],
        cmd: string,
    ): IBXDeal[] {
        for (const chunk of results) {
            const value: unknown = chunk.result?.[cmd];
            if (Array.isArray(value)) return value as IBXDeal[];
        }
        return [];
    }
}
