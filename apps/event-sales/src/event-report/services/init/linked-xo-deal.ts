import { IBXDeal } from '@/modules/bitrix/domain/crm/deal/interface/bx-deal.interface';
import { toLinkedDealId } from '../../../cold-hook-v2/lib/deal-link-fields';

/**
 * Сделки, которые ссылаются на основную `baseDealId` через поле `linkKey`
 * (`to_base_sales`). Отбор по значению, а не доверие фильтру REST: поле,
 * которого нет на портале, Битрикс в фильтре молча игнорирует и отдаёт
 * чужие сделки.
 */
export const dealsLinkedToBase = (
    deals: readonly IBXDeal[],
    linkKey: string,
    baseDealId: string | number,
): IBXDeal[] =>
    deals.filter(deal => toLinkedDealId(deal[linkKey]) === Number(baseDealId));

/**
 * ХО-сделка отчёта — та, что ссылается на основную ЭТОЙ работы
 * (`to_base_sales`), а не первая попавшаяся открытая ХО-сделка клиента.
 *
 * У компании может висеть несколько открытых ХО-сделок: прошлые запуски ХО,
 * чужие менеджеры (garant, 14.10.2026: старая #80903 и текущая #92283 одной
 * компании). Раньше брали первую «свою» по порядку списка — могли закрыть
 * не ту, а нужная оставалась висеть в «Запланирован».
 *
 * Связанных нет (старые ХО-сделки без ссылки) — прежний выбор `fallback`.
 * Среди связанных предпочитаем свою, затем самую свежую.
 */
export const selectLinkedXoDeal = (input: {
    activeDeals: readonly IBXDeal[];
    linkKey: string;
    xoCategoryId: string | null;
    baseDealId: string | number | null;
    ownResponsibleIds: ReadonlySet<number>;
    fallback: IBXDeal | null;
}): IBXDeal | null => {
    if (!input.xoCategoryId || !input.baseDealId) return input.fallback;
    const linked = dealsLinkedToBase(
        input.activeDeals,
        input.linkKey,
        input.baseDealId,
    ).filter(deal => String(deal.CATEGORY_ID) === input.xoCategoryId);
    if (!linked.length) return input.fallback;
    // Пустой набор «своих» — фильтр выключен (легаси-DTO), как в groupDealsByCategory.
    const own = linked.filter(
        deal =>
            input.ownResponsibleIds.size === 0 ||
            input.ownResponsibleIds.has(Number(deal.ASSIGNED_BY_ID)),
    );
    const pool = own.length ? own : linked;
    return pool.reduce((latest, deal) =>
        Number(deal.ID) > Number(latest.ID) ? deal : latest,
    );
};
