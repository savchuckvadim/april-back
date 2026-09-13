import { BxDocumentDeal } from 'generated/prisma';
import { InnerDealSnapshotDto } from '../dto/inner-deal.dto';
import { parseComplectComposition } from '../type/complect-composition.type';

/**
 * BigInt-колонки (id, portalId, templateId, favoriteId) не сериализуются JSON.stringify —
 * приводим к number на границе HTTP.
 *
 * Настройки сборки отдаём разобранным объектом, а не строкой: остальные
 * payload-колонки фронт разбирает сам (формат v1), а `settings` — наш формат,
 * и разбирать его на каждом фронте заново незачем.
 */
export const toInnerDealSnapshotDto = (
    deal: BxDocumentDeal,
): InnerDealSnapshotDto => ({
    id: Number(deal.id),
    dealId: deal.dealId ?? null,
    userId: deal.userId ?? null,
    domain: deal.domain ?? null,
    serviceSmartId: deal.serviceSmartId ?? null,
    variantSmartId: deal.smartId ?? null,
    templateId: deal.templateId === null ? null : Number(deal.templateId),
    favoriteId: deal.favoriteId === null ? null : Number(deal.favoriteId),
    isFavorite: deal.isFavorite ?? null,
    dealName: deal.dealName ?? null,
    app: deal.app ?? null,
    global: deal.global ?? null,
    currentComplect: deal.currentComplect ?? null,
    od: deal.od ?? null,
    result: deal.result ?? null,
    contract: deal.contract ?? null,
    product: deal.product ?? null,
    rows: deal.rows ?? null,
    regions: deal.regions ?? null,
    iskraConfig: deal.iskraConfig ?? null,
    ltOther: deal.ltOther ?? null,
    settings: parseComplectComposition(deal.settings),
});
