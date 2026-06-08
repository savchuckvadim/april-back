import { IBXDeal } from '@/modules/bitrix';
import { IFieldCode } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

export const getContractPeriodFieldBitrixId = (
    portal: PortalModel,
    type: 'start' | 'end',
) => {
    const code: IFieldCode =
        type === 'start' ? 'contract_start' : 'contract_end';
    return portal.getDealFieldBitrixIdByCode(code);
};

export const getContractPeriodDealValue = (
    deal: IBXDeal,
    portal: PortalModel,
    type: 'start' | 'end',
) => {
    const bitrixId = getContractPeriodFieldBitrixId(portal, type);
    return deal[bitrixId];
};

export const getContractPeriodDealData = (
    deal: IBXDeal,
    portal: PortalModel,
) => {
    const from = getContractPeriodDealValue(deal, portal, 'start') as string;
    const to = getContractPeriodDealValue(deal, portal, 'end') as string;
    return { from, to };
};
