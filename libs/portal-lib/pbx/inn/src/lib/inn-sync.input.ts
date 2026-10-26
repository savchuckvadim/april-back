import type { IInnDealState } from '../services/inn-deal-state.reader';
import { innList } from './inn-row.util';
import type { InnSyncRequisites } from './inn-sync.plan';

/** Пул ИНН сделки (`op_inn_pool`) для выравнивания. */
export function innDealPool(state: IInnDealState): string[] {
    const name = state.fields.pool('deal');
    return name ? innList(state.deal[name]) : [];
}

/**
 * ИНН реквизитов КОМПАНИИ сделки (контакты не в счёт) и привязанного к
 * сделке. Реквизиты не прочитались — пусто: выравнивание из них не идёт.
 */
export function innCompanyRequisites(state: IInnDealState): InnSyncRequisites {
    if (!state.requisitesReadable || !state.companyId) {
        return { linkedInn: '', companyInns: [] };
    }
    const own = state.requisites.filter(
        card =>
            card.ownerType === 'company' && card.ownerId === state.companyId,
    );
    return {
        linkedInn: own.find(card => card.linked)?.inn ?? '',
        companyInns: own.map(card => card.inn),
    };
}
