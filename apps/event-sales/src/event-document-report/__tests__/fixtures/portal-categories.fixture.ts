/**
 * Фейковые воронки и стадии портала: «ОП Основная» со всей лестницей стадий и пустая «Презентации».
 */
import {
    PBX_DEAL_SALES_BASE_STAGES,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    BASE_CATEGORY_BITRIX_ID,
    PRESENTATION_CATEGORY_BITRIX_ID,
} from './document-scenario.fixture';

// === Воронки и стадии ===
export interface FakeStage {
    code: string;
    bitrixId: string;
    name: string;
}

export interface FakeCategory {
    code: string;
    bitrixId: string;
    stages: FakeStage[];
}

/** bitrixId стадии «ОП Основная»: `sales_offer_create` → `OFFER_CREATE`. */
export const baseStageBitrixId = (code: PbxDealSalesBaseStageCode): string =>
    code.replace(/^sales_/, '').toUpperCase();

/** STAGE_ID сделки «ОП Основная» на этой стадии: `C7:OFFER_CREATE`. */
export const baseStageId = (code: PbxDealSalesBaseStageCode): string =>
    `C${BASE_CATEGORY_BITRIX_ID}:${baseStageBitrixId(code)}`;

/** Воронка «ОП Основная» со всей лестницей стадий, кроме перечисленных. */
export const makeBaseCategory = (
    withoutStages: readonly PbxDealSalesBaseStageCode[] = [],
): FakeCategory => ({
    code: PbxDealCategoryCodeEnum.sales_base,
    bitrixId: BASE_CATEGORY_BITRIX_ID,
    stages: PBX_DEAL_SALES_BASE_STAGES.filter(
        stage => !withoutStages.includes(stage.code),
    ).map(stage => ({
        code: stage.code,
        bitrixId: baseStageBitrixId(stage.code),
        name: stage.code,
    })),
});

export const makePresentationCategory = (): FakeCategory => ({
    code: PbxDealCategoryCodeEnum.sales_presentation,
    bitrixId: PRESENTATION_CATEGORY_BITRIX_ID,
    stages: [],
});
