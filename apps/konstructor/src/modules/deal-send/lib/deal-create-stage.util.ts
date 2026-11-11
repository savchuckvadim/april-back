import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';

/**
 * Стадия новой сделки конструктора — «Документы» воронки sales_base
 * (решение владельца 11.11.2026). Раньше браузерный addDeal ставил стадию из
 * Firebase-карты портала, и при пустой карте сделка падала в «Общую».
 */
export const DEAL_SEND_CREATE_STAGE_CODE =
    PBX_DEAL_SALES_BASE_STAGE_CODE.offerCreate;

/**
 * STAGE_ID стадии сделки: `C{воронка}:{стадия}`, у общей воронки (0) — без
 * префикса. Стадию, уже сохранённую полным STAGE_ID, берём как есть.
 *
 * Повторяет stageIdOf из event-sales (cold-hook-v2/lib/reopenable-base-deal.ts):
 * приложения монорепо не импортируют код друг друга. Типизированный
 * PortalModel.getDealStageByCode для этого не годится — его карта типов
 * собрана из устаревшего enum без sales_offer_create.
 */
export const stageIdOf = (
    category: Pick<IPCategory, 'bitrixId'>,
    stageBitrixId: string,
): string => {
    if (/^C\d+:/.test(stageBitrixId)) {
        return stageBitrixId;
    }
    return String(category.bitrixId) === '0'
        ? stageBitrixId
        : `C${category.bitrixId}:${stageBitrixId}`;
};

/** STAGE_ID «Документов» в этой воронке либо null, если стадии нет в схеме портала. */
export const resolveCreateStageId = (
    category: Pick<IPCategory, 'bitrixId' | 'stages'>,
): string | null => {
    const stage = (category.stages ?? []).find(
        item => item.code === DEAL_SEND_CREATE_STAGE_CODE,
    );
    return stage?.bitrixId ? stageIdOf(category, String(stage.bitrixId)) : null;
};
