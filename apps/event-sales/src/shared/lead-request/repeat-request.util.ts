import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';

type BxRow = Record<string, unknown>;

/**
 * ПОВТОРНАЯ ЗАЯВКА по строке сделки, на которую указывает лид (решения
 * владельца 28.09 и 01.10.2026): лид присоединён к ЧУЖОЙ сделке клиента, а
 * не к своей. От ответа зависят ожидание принятия ×3 в SLA и блок
 * «повторное обращение» в карточке заявки — правило у них одно:
 *  - первоисточник сделки (`deal_from_lead_id`) — ДРУГОЙ лид → повтор;
 *  - первоисточника нет, а лид — среди присоединённых (`deal_joined_leads`)
 *    → повтор: так выглядит сделка холодного звонка, ручная или старая
 *    после присоединения — первоисточником заявка не становится;
 *  - первоисточник — сам лид → его собственная сделка, не повтор.
 *
 * Поле первоисточника на портале не установлено — своё и чужое не
 * различить (присоединённые есть и у собственной сделки лида): не повтор.
 */
export function isRepeatRequestDeal(
    portal: PortalModel,
    deal: BxRow,
    leadId: number,
): boolean {
    const fromLeadName = dealFieldName(
        portal,
        PBX_SALES_EVENT_FIELD_CODES.deal_from_lead_id,
    );
    if (!fromLeadName) return false;
    const [fromLeadId] = leadRefIds(deal[fromLeadName]);
    if (fromLeadId !== undefined) return fromLeadId !== leadId;
    const joinedName = dealFieldName(
        portal,
        PBX_SALES_EVENT_FIELD_CODES.deal_joined_leads,
    );
    return !!joinedName && leadRefIds(deal[joinedName]).includes(leadId);
}

function dealFieldName(portal: PortalModel, code: string): string | null {
    const field = portal.getEntityFieldByCode('deal', code);
    return field ? portal.getFieldBitrixId(field) : null;
}

/** id лидов из значения crm-поля: `L_12`, `12`, 12 или их список. */
function leadRefIds(raw: unknown): number[] {
    const ids: number[] = [];
    for (const value of Array.isArray(raw) ? raw : [raw]) {
        if (typeof value !== 'string' && typeof value !== 'number') continue;
        const match = /^(?:L_)?(\d+)$/i.exec(String(value).trim());
        const id = match ? Number(match[1]) : 0;
        if (id > 0) ids.push(id);
    }
    return ids;
}
