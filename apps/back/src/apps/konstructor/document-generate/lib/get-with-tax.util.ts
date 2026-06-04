import { RqEntity } from '@lib/portal-konstructor/provider';
import { CONTRACT_LTYPE } from '../type/contract.type';

export const getWithTax = (
    provider: RqEntity | null,
    contractType: CONTRACT_LTYPE,
): boolean => {
    const withTax =
        (provider?.withTax && contractType !== CONTRACT_LTYPE.LIC) || false;
    return withTax;
};
