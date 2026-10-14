import { IBXDeal } from '@/modules/bitrix';
import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';

/**
 * Стадии отказа, из которых ХО возвращает основную в работу. «Не беспокоить»
 * (клиент просил не звонить) и «Успех» (продажа) сюда не входят — решение
 * владельца 14.10.2026.
 */
const REOPEN_STAGE_CODES: ReadonlySet<string> =
    new Set<PbxDealSalesBaseStageCode>([
        PBX_DEAL_SALES_BASE_STAGE_CODE.fail,
        PBX_DEAL_SALES_BASE_STAGE_CODE.apology,
        PBX_DEAL_SALES_BASE_STAGE_CODE.notCa,
    ]);

/** STAGE_ID стадии: у общей воронки (0) он без префикса `C0:`. */
const stageIdOf = (category: IPCategory, stageBitrixId: string): string =>
    String(category.bitrixId) === '0'
        ? stageBitrixId
        : `C${category.bitrixId}:${stageBitrixId}`;

/**
 * ХО запустили из основной сделки, закрытой в отказ, а открытых основных у
 * клиента нет — вернуть в работу её, а не заводить новую (garant,
 * 14.10.2026). «Звонки» поступают так же (closed-launch-base-deal).
 * Возвращает сама холодная работа: основная уходит в «Холодные» и новому
 * ответственному (ColdDealFlowService.prepareBaseDeal).
 *
 * null — сделка не основная, не закрыта отказом или её стадии нет в слепке
 * портала: тогда, как раньше, заводится новая основная.
 */
export const reopenableBaseDeal = (
    deal: IBXDeal | null,
    baseCategory: IPCategory | null | undefined,
): IBXDeal | null => {
    if (!deal || !baseCategory) return null;
    if (String(deal.CATEGORY_ID) !== String(baseCategory.bitrixId)) {
        return null;
    }
    const stage = baseCategory.stages.find(
        item =>
            stageIdOf(baseCategory, String(item.bitrixId)) ===
            String(deal.STAGE_ID),
    );
    return stage && REOPEN_STAGE_CODES.has(stage.code) ? deal : null;
};
