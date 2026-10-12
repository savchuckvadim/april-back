import { isValidInn, normalizeInn, uniq } from '@lib/portal-lib/pbx-duplicate';

/**
 * Текущий ИНН — ОДИН и тот же в сделке и в компании (владелец, 06.10.2026),
 * в каком бы порядке они ни появлялись: компанию прицепили к сделке позже,
 * ИНН вписали в компанию раньше, а то и ИНН есть только в заявке.
 *
 * Правило при открытии вкладки «ИНН» (пишет, только когда есть что
 * выровнять, — один раз на сделку):
 *  - в сделке есть, в компании пусто — переносим в компанию;
 *  - в сделке пусто, в компании есть — переносим в сделку;
 *  - пусто в обеих, а в заявках ровно один ИНН — ставим его в сделку и
 *    компанию (ИНН мог прийти только с заявкой);
 *  - в обеих есть, но разные — сами не решаем: какой текущий, выбирает
 *    человек (конфликт во вкладке, выбор пишет в обе).
 */
export const INN_SYNC_KINDS = {
    none: 'none',
    toCompany: 'to_company',
    toDeal: 'to_deal',
    mismatch: 'mismatch',
} as const;

/** Откуда переносим ИНН в сделку — для записи в ленте. */
export const INN_SYNC_SOURCES = {
    company: 'company',
    lead: 'lead',
} as const;

export type InnSyncSource =
    (typeof INN_SYNC_SOURCES)[keyof typeof INN_SYNC_SOURCES];

export type InnSyncPlan =
    | { kind: typeof INN_SYNC_KINDS.none }
    | { kind: typeof INN_SYNC_KINDS.toCompany; inn: string }
    | { kind: typeof INN_SYNC_KINDS.toDeal; inn: string; from: InnSyncSource }
    | {
          kind: typeof INN_SYNC_KINDS.mismatch;
          dealInn: string;
          companyInn: string;
      };

const NONE: InnSyncPlan = { kind: INN_SYNC_KINDS.none };

const valid = (raw: string): string => {
    const inn = normalizeInn(raw) ?? '';
    return inn && isValidInn(inn) ? inn : '';
};

export const planInnSync = (input: {
    /** Текущий ИНН сделки (`op_inn`). */
    dealInn: string;
    /** Текущий ИНН компании (`op_inn`); компании нет — пусто. */
    companyInn: string;
    /** У сделки есть компания с полем ИНН — переносить есть куда. */
    hasCompany: boolean;
    /** Текущие ИНН заявок сделки. */
    leadInns: readonly string[];
}): InnSyncPlan => {
    const dealInn = valid(input.dealInn);
    const companyInn = input.hasCompany ? valid(input.companyInn) : '';

    if (dealInn && companyInn) {
        return dealInn === companyInn
            ? NONE
            : { kind: INN_SYNC_KINDS.mismatch, dealInn, companyInn };
    }
    if (dealInn) {
        return input.hasCompany
            ? { kind: INN_SYNC_KINDS.toCompany, inn: dealInn }
            : NONE;
    }
    if (companyInn) {
        return {
            kind: INN_SYNC_KINDS.toDeal,
            inn: companyInn,
            from: INN_SYNC_SOURCES.company,
        };
    }
    const leadInns = uniq(input.leadInns.map(valid).filter(Boolean));
    return leadInns.length === 1
        ? {
              kind: INN_SYNC_KINDS.toDeal,
              inn: leadInns[0],
              from: INN_SYNC_SOURCES.lead,
          }
        : NONE;
};
