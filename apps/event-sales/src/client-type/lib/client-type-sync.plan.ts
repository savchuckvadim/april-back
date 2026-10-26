import { ClientTypeCode } from './client-type.const';

/** Что сделать с типом клиента у сделки и компании. */
export const CLIENT_TYPE_SYNC_KINDS = {
    /** Обе стороны совпадают, обе пусты или компании нет. */
    none: 'none',
    /** В сделке пусто — переносим из компании. */
    toDeal: 'toDeal',
    /** В компании пусто — переносим из сделки. */
    toCompany: 'toCompany',
    /** Разные значения — решает человек. */
    conflict: 'conflict',
} as const;

export type ClientTypeSyncPlan =
    | { kind: typeof CLIENT_TYPE_SYNC_KINDS.none }
    | {
          kind:
              | typeof CLIENT_TYPE_SYNC_KINDS.toDeal
              | typeof CLIENT_TYPE_SYNC_KINDS.toCompany;
          code: ClientTypeCode;
      }
    | {
          kind: typeof CLIENT_TYPE_SYNC_KINDS.conflict;
          deal: ClientTypeCode;
          company: ClientTypeCode;
      };

export interface IClientTypeSyncInput {
    deal: ClientTypeCode | null;
    company: ClientTypeCode | null;
    /** У сделки есть компания с полем «Тип Клиента». */
    hasCompany: boolean;
}

/**
 * Тип клиента один на клиента (владелец 26.10.2026, то же правило, что у
 * ИНН): главное значение у компании, сделка его повторяет. Пустая сторона
 * заполняется из непустой, разные значения — конфликт, его решает человек.
 * Чистая функция: проверяется без Битрикса.
 */
export function planClientTypeSync(
    input: IClientTypeSyncInput,
): ClientTypeSyncPlan {
    const { deal, company, hasCompany } = input;
    if (!hasCompany) return { kind: CLIENT_TYPE_SYNC_KINDS.none };
    if (deal && company) {
        return deal === company
            ? { kind: CLIENT_TYPE_SYNC_KINDS.none }
            : { kind: CLIENT_TYPE_SYNC_KINDS.conflict, deal, company };
    }
    if (company) return { kind: CLIENT_TYPE_SYNC_KINDS.toDeal, code: company };
    if (deal) return { kind: CLIENT_TYPE_SYNC_KINDS.toCompany, code: deal };
    return { kind: CLIENT_TYPE_SYNC_KINDS.none };
}
