import type { IInnDealState } from '../services/inn-deal-state.reader';
import { fieldInns } from './inn-observe.util';
import { innList } from './inn-row.util';
import type { InnSyncLegacy, InnSyncRequisites } from './inn-sync.plan';

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

/**
 * ИНН старых полей портала сделки и компании (настройка
 * `inn_legacy_fields_*`). Строки читаются целиком (`crm.*.get` без
 * `select`), поэтому лишних запросов нет ни в снимке, ни в лёгком чтении.
 */
export function innLegacyValues(state: IInnDealState): InnSyncLegacy {
    return {
        deal: fieldInns(state.deal, state.fields.legacy('deal')),
        company: state.company
            ? fieldInns(state.company, state.fields.legacy('company'))
            : [],
    };
}
