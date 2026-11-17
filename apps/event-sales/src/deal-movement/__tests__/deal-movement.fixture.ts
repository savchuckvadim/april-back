import { ETimeZone } from '@lib/shared/lib/date';
import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { buildSalesBaseStageLookup } from '../lib/deal-movement-stages';
import type { DealMovementDealRow } from '../types/deal-movement.types';

/** Воронка «ОП Основная» тестового портала: категория 7, стадии по кодам. */
export const CATEGORY = {
    bitrixId: '7',
    stages: [
        { code: PBX_DEAL_SALES_BASE_STAGE_CODE.cold, bitrixId: 'COLD' },
        { code: PBX_DEAL_SALES_BASE_STAGE_CODE.presentation, bitrixId: 'PRES' },
        { code: PBX_DEAL_SALES_BASE_STAGE_CODE.refine, bitrixId: 'REFINE' },
        { code: PBX_DEAL_SALES_BASE_STAGE_CODE.documentSend, bitrixId: 'SEND' },
        { code: PBX_DEAL_SALES_BASE_STAGE_CODE.fail, bitrixId: 'FAIL' },
    ],
};

export const STAGES = buildSalesBaseStageLookup(
    CATEGORY as unknown as Parameters<typeof buildSalesBaseStageLookup>[0],
);

export const TZ = ETimeZone.EUROPE_MOSCOW;

/** Открытая сделка в объёме правил; поля — по умолчанию спокойная. */
export const dealRow = (
    dealId: number,
    fields: Partial<DealMovementDealRow> = {},
): DealMovementDealRow => ({
    dealId,
    title: `Сделка ${dealId}`,
    stageCode: PBX_DEAL_SALES_BASE_STAGE_CODE.presentation,
    stageOrder: 4,
    assignedById: 7,
    amount: 100_000,
    companyId: null,
    contactId: null,
    leadId: null,
    movedAt: '2026-11-15T09:00:00.000Z',
    lastActivityAt: '2026-11-16T09:00:00.000Z',
    createdAt: '2026-10-01T09:00:00.000Z',
    ...fields,
});
