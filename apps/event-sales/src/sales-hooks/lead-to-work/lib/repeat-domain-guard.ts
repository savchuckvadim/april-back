/**
 * Проверка сигнала «домен почты» перед присоединением повторной заявки.
 *
 * Домен — самый слабый признак клиента: на одном домене сидят и сотрудники
 * одной фирмы (то, ради чего сигнал просили, garant 21.09.2026), и десятки
 * разных организаций — холдинг, провайдер, областная администрация. На
 * garant общий домен Воронежской области `govvrn.ru` склеил четыре чужие
 * заявки с двумя разными учреждениями (08–28.10.2026, сделки 92231 и 95597).
 *
 * Правила (решение владельца 09.11.2026):
 *  1. Заявка с ИНН не присоединяется по домену к сделке с другим ИНН.
 *  2. Домен, найденный у двух и более РАЗНЫХ клиентов, общий — по нему не
 *     присоединяем вовсе. Клиент — компания или ИНН; сделки без компании и
 *     без ИНН неизвестно чьи и в подсчёт не входят: их как раз и склеивает
 *     домен, когда фирма пишет с одного адреса.
 *
 * Чистая логика без I/O.
 */

/** Кто стоит за сделкой (или за найденной компанией). */
export interface DomainClientRef {
    readonly companyId: number | null;
    /** Нет — ИНН неизвестен. */
    readonly inns?: readonly string[];
}

export type DomainGuardSkip = 'inn-conflict' | 'shared-domain';

export interface DomainGuardResult<T> {
    /** Сделки, по которым домен ещё можно считать признаком клиента. */
    readonly deals: T[];
    /** Почему домен не годится; null — годится. */
    readonly skipped: DomainGuardSkip | null;
}

const hasCommon = (a: readonly string[], b: readonly string[]): boolean =>
    a.some(value => b.includes(value));

const innsOf = (ref: DomainClientRef): readonly string[] => ref.inns ?? [];

/** Один клиент: та же компания либо общий ИНН. */
const sameClient = (a: DomainClientRef, b: DomainClientRef): boolean =>
    (a.companyId !== null && a.companyId === b.companyId) ||
    hasCommon(innsOf(a), innsOf(b));

/** Сколько разных известных клиентов среди ссылок (неизвестные — мимо). */
export const countDistinctClients = (
    refs: readonly DomainClientRef[],
): number => {
    const clusters: DomainClientRef[][] = [];
    for (const ref of refs) {
        if (ref.companyId === null && !innsOf(ref).length) continue;
        const cluster = clusters.find(group =>
            group.some(member => sameClient(member, ref)),
        );
        if (cluster) cluster.push(ref);
        else clusters.push([ref]);
    }
    return clusters.length;
};

export const guardEmailDomain = <T extends DomainClientRef>(
    deals: readonly T[],
    foundCompanyIds: readonly number[],
    leadInns: readonly string[],
): DomainGuardResult<T> => {
    const conflicts = (deal: T): boolean =>
        leadInns.length > 0 &&
        innsOf(deal).length > 0 &&
        !hasCommon(innsOf(deal), leadInns);
    const kept = deals.filter(deal => !conflicts(deal));
    if (deals.length && !kept.length) {
        return { deals: [], skipped: 'inn-conflict' };
    }

    const refs: DomainClientRef[] = [
        ...deals,
        ...foundCompanyIds.map(companyId => ({ companyId, inns: [] })),
    ];
    if (countDistinctClients(refs) > 1) {
        return { deals: [], skipped: 'shared-domain' };
    }
    return { deals: kept, skipped: null };
};
