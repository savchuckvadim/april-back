import { IBXDeal } from '@/modules/bitrix';
import { EnumColdCallForce } from '../dto/cold.dto';

/**
 * Решение холодного старта по занятому клиенту (шаг 4 плана v2) — чистая
 * функция, без Bitrix и портала. Правило владельца 02.09.2026:
 *  - `force=Y` — забираем клиента всегда; у кого забрали — узнают из
 *    таймлайна и push («у вас забрали клиента»);
 *  - `force=N` — если у клиента есть открытая основная сделка ОП ДРУГОГО
 *    сотрудника, уступаем: новая работа не создаётся, чужое не трогается,
 *    закрываются только входная сделка и её связи; владелец узнаёт из
 *    таймлайна и push («у вас попытались забрать»); иначе — полный старт.
 *
 * «Другой сотрудник» сравнивается с `responsible` хука: им и была бы новая
 * работа. Своя вторая основная (того же сотрудника) не мешает; входная
 * сделка из решения исключена — её мы забираем в любом режиме. Но если она
 * при этом чужая открытая основная, её владелец получает «забрали» наравне
 * с остальными (ревью 02.09: раньше её забирали молча).
 */

export type ColdStartMode = 'proceed' | 'yield';

/** Чужая открытая основная — адресат записи в таймлайн и push. */
export interface ForeignOpenDeal {
    dealId: number;
    responsibleId: number;
}

export interface ColdStartDecisionInput {
    force: EnumColdCallForce;
    /** Ответственный новой холодной работы — `responsible` из хука. */
    responsibleId: number;
    /** Входная сделка хука; null — вход-компания. */
    entryDealId: number | null;
    /** Открытые основные `sales_base` клиента (ColdRelations.openBaseDeals). */
    openBaseDeals: readonly Pick<IBXDeal, 'ID' | 'ASSIGNED_BY_ID' | 'CLOSED'>[];
}

export interface ColdStartDecision {
    mode: ColdStartMode;
    /**
     * Чужие открытые основные (кроме входной), свежие первыми. В `yield` — у
     * кого НЕ забрали; в `proceed` при `force=Y` — у кого ЗАБРАЛИ (их работа
     * закрыта или переназначена). Пусто — чужой работы не было.
     */
    foreign: ForeignOpenDeal[];
    /**
     * Входная сделка, если она — открытая основная ДРУГОГО сотрудника: её
     * забирают в любом режиме, режим она не меняет, но владельцу положено
     * «у вас забрали». null — входная своя, не основная или её нет.
     */
    takenEntry: ForeignOpenDeal | null;
    /** Причина для лога и таймлайна. */
    reason: string;
}

const toId = (raw: unknown): number => {
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : 0;
};

export const decideColdStart = (
    input: ColdStartDecisionInput,
): ColdStartDecision => {
    const others = input.openBaseDeals
        .filter(deal => String(deal.CLOSED ?? 'N') !== 'Y')
        .map(deal => ({
            dealId: toId(deal.ID),
            responsibleId: toId(deal.ASSIGNED_BY_ID),
        }))
        .filter(
            deal =>
                deal.dealId > 0 &&
                // Без ответственного — ничья работа, отбирать не у кого.
                deal.responsibleId > 0 &&
                deal.responsibleId !== input.responsibleId,
        )
        .sort((a, b) => b.dealId - a.dealId);
    const takenEntry =
        others.find(deal => deal.dealId === input.entryDealId) ?? null;
    const foreign = others.filter(deal => deal.dealId !== input.entryDealId);
    const [primary] = foreign;

    if (input.force === EnumColdCallForce.Y) {
        return {
            mode: 'proceed',
            foreign,
            takenEntry,
            reason: primary
                ? `force=Y: забираем клиента у сотрудника #${primary.responsibleId} ` +
                  `(основная сделка #${primary.dealId}) — его открытая работа закрывается`
                : 'force=Y: чужой открытой основной нет — полный старт',
        };
    }

    if (!primary) {
        return {
            mode: 'proceed',
            foreign: [],
            takenEntry,
            reason: 'force=N: чужой открытой основной сделки нет — полный старт',
        };
    }
    return {
        mode: 'yield',
        foreign,
        takenEntry,
        reason:
            `force=N: клиент в работе у сотрудника #${primary.responsibleId} ` +
            `(основная сделка #${primary.dealId}) — уступаем: закрываем только ` +
            'входную сделку и её связи, новую работу не создаём',
    };
};
