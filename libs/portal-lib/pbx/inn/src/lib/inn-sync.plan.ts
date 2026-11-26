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
 *  - пусто в обеих и пул сделки пуст (или в нём только этот ИНН), а у
 *    компании есть реквизит — ставим ИНН реквизита в сделку и компанию
 *    (владелец 25.10.2026): реквизит, привязанный к сделке, а без привязки —
 *    единственный ИНН среди реквизитов компании. Разные ИНН без привязки —
 *    выбирает человек;
 *  - пусто в обеих, а в заявках ровно один ИНН — ставим его в сделку и
 *    компанию (ИНН мог прийти только с заявкой);
 *  - пусто в обеих, в заявках ИНН нет, а в старых полях портала (настройка
 *    `inn_legacy_fields_*`, владелец 26.11.2026) ровно один ИНН — ставим
 *    его. Сначала поля сделки; они пусты — поля компании. Пул сделки с
 *    другими ИНН — не решаем за человека, как с реквизитом;
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
    /** Реквизит компании (RQ_INN): привязанный к сделке или единственный. */
    requisite: 'requisite',
    lead: 'lead',
    /** Старые поля портала (настройка `inn_legacy_fields_*`). */
    legacy: 'legacy',
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

/** ИНН реквизитов компании для выравнивания — без лишних чтений. */
export interface InnSyncRequisites {
    /** ИНН реквизита, привязанного к сделке (`crm.requisite.link`). */
    linkedInn: string;
    /** ИНН всех реквизитов компании. */
    companyInns: readonly string[];
}

const NO_REQUISITES: InnSyncRequisites = { linkedInn: '', companyInns: [] };

/** ИНН из старых полей портала: сделки и компании (уже разобранные). */
export interface InnSyncLegacy {
    deal: readonly string[];
    company: readonly string[];
}

const NO_LEGACY: InnSyncLegacy = { deal: [], company: [] };

const distinctValid = (inns: readonly string[]): string[] =>
    uniq(inns.map(valid).filter(Boolean));

/** Пул сделки уже с другими ИНН — не решаем за человека. */
const agreesWithPool = (inn: string, dealPool: readonly string[]): boolean =>
    distinctValid(dealPool).every(item => item === inn);

/** ИНН из реквизитов компании: привязанный к сделке, иначе единственный. */
const requisiteInn = (
    requisites: InnSyncRequisites,
    dealPool: readonly string[],
): string => {
    const linked = valid(requisites.linkedInn);
    const distinct = distinctValid(requisites.companyInns);
    const inn = linked || (distinct.length === 1 ? distinct[0] : '');
    return inn && agreesWithPool(inn, dealPool) ? inn : '';
};

/**
 * ИНН из старых полей портала: единственный в полях сделки; поля сделки
 * пусты — единственный в полях компании. Несколько разных — выбор человека.
 */
const legacyInn = (
    legacy: InnSyncLegacy,
    dealPool: readonly string[],
): string => {
    const deal = distinctValid(legacy.deal);
    const company = distinctValid(legacy.company);
    const own = deal.length ? deal : company;
    const inn = own.length === 1 ? own[0] : '';
    return inn && agreesWithPool(inn, dealPool) ? inn : '';
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
    /** Пул ИНН сделки (`op_inn_pool`). */
    dealPool?: readonly string[];
    /** Реквизиты компании; не прочитаны — пусто. */
    requisites?: InnSyncRequisites;
    /** ИНН из старых полей портала; настройки нет — пусто. */
    legacy?: InnSyncLegacy;
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
    const fromRequisite = input.hasCompany
        ? requisiteInn(input.requisites ?? NO_REQUISITES, input.dealPool ?? [])
        : '';
    if (fromRequisite) {
        return {
            kind: INN_SYNC_KINDS.toDeal,
            inn: fromRequisite,
            from: INN_SYNC_SOURCES.requisite,
        };
    }
    const leadInns = distinctValid(input.leadInns);
    if (leadInns.length === 1) {
        return {
            kind: INN_SYNC_KINDS.toDeal,
            inn: leadInns[0],
            from: INN_SYNC_SOURCES.lead,
        };
    }
    // Разные ИНН в заявках — уже выбор человека, старые поля его не решают.
    if (leadInns.length > 1) return NONE;
    const fromLegacy = legacyInn(
        input.legacy ?? NO_LEGACY,
        input.dealPool ?? [],
    );
    return fromLegacy
        ? {
              kind: INN_SYNC_KINDS.toDeal,
              inn: fromLegacy,
              from: INN_SYNC_SOURCES.legacy,
          }
        : NONE;
};
