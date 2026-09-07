import { ColdTarget } from '../target/cold-target.types';

/**
 * Кому принадлежит новая холодная работа (шаг 6 плана v2).
 *
 *  - `company` — как v1: сделки, задача и KPI-строки привязаны к компании;
 *  - `deal` — клиент без компании: привязка идёт через сделки, а контакт и
 *    лид ВХОДНОЙ сделки переносятся на новые сделки, чтобы клиент не
 *    потерялся между воронками.
 */
export interface ColdOwnerCompany {
    kind: 'company';
    companyId: number;
}

export interface ColdOwnerDeal {
    kind: 'deal';
    entryDealId: number;
    contactId: number | null;
    leadId: number | null;
}

export type ColdOwner = ColdOwnerCompany | ColdOwnerDeal;

/**
 * Суффикс batch-ключей и кодов элементов списков. У компании — её id (формат
 * исторический, менять нельзя: код элемента KPI хранит идемпотентность);
 * у сделки — `deal_<id>`.
 */
export const ownerKey = (owner: ColdOwner): string =>
    owner.kind === 'company'
        ? String(owner.companyId)
        : `deal_${owner.entryDealId}`;

const toId = (raw: unknown): number | null => {
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
};

export const ownerFromTarget = (target: ColdTarget): ColdOwner => {
    if (target.kind === 'company' && target.companyId) {
        return { kind: 'company', companyId: target.companyId };
    }
    const entry = target.entryDeal as unknown as Record<string, unknown> | null;
    return {
        kind: 'deal',
        entryDealId: Number(entry?.['ID'] ?? 0),
        contactId: toId(entry?.['CONTACT_ID']),
        leadId: toId(entry?.['LEAD_ID']),
    };
};
