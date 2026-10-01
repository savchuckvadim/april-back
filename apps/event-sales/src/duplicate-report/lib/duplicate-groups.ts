import {
    DuplicateClientInput,
    DuplicateClientRef,
    DuplicateContext,
    DuplicateDeal,
    DuplicateGroup,
} from '../types/duplicate-report.types';

/**
 * ГРУППИРОВКА СДЕЛОК ПО КЛИЕНТУ — чистые функции, без Битрикса.
 *
 * Клиент — компания сделки; сделки без компании группируются по контакту.
 * Сделка без компании, чей контакт стоит в сделке РОВНО ОДНОЙ компании,
 * относится к этой компании: так выглядит повторная заявка, узнанная
 * только по контакту, или сделка, заведённая из карточки контакта (разбор
 * 30.09: «почта нашлась только у контакта без компании»). Контакт в
 * сделках двух компаний — неоднозначно, сделка остаётся у контакта.
 * Дубль — клиент, у которого открытых сделок воронки две и больше.
 */

/** Ключ клиента для карт: `company:12` / `contact:7`. */
export const clientKey = (ref: DuplicateClientRef): string =>
    `${ref.kind}:${ref.id}`;

/**
 * Клиент сделки: компания приоритетнее контакта; сделка без компании — к
 * единственной компании её контакта; null — клиента нет.
 */
const clientOf = (
    deal: DuplicateDeal,
    companyByContact: ReadonlyMap<number, number | null>,
): DuplicateClientRef | null => {
    if (deal.companyId) return { kind: 'company', id: deal.companyId };
    if (!deal.contactId) return null;
    const companyId = companyByContact.get(deal.contactId);
    return companyId
        ? { kind: 'company', id: companyId }
        : { kind: 'contact', id: deal.contactId };
};

/** Контакт → единственная компания его сделок; null — компаний несколько. */
const companiesOfContacts = (
    deals: readonly DuplicateDeal[],
): Map<number, number | null> => {
    const result = new Map<number, number | null>();
    for (const deal of deals) {
        if (!deal.companyId || !deal.contactId) continue;
        const known = result.get(deal.contactId);
        if (known === undefined) result.set(deal.contactId, deal.companyId);
        else if (known !== deal.companyId) result.set(deal.contactId, null);
    }
    return result;
};

/** Сделки → клиенты, у которых открытых сделок не меньше двух. */
export function groupDealsByClient(
    deals: readonly DuplicateDeal[],
): DuplicateGroup[] {
    return clientGroupsOf(deals).filter(group => group.deals.length > 1);
}

/**
 * Сделки → все клиенты, и с одной сделкой тоже: блоку «Открытые сделки по клиенту» в
 * «Звонках» нужно показать и единственную сделку («дублей нет»).
 */
export function clientGroupsOf(
    deals: readonly DuplicateDeal[],
): DuplicateGroup[] {
    const companyByContact = companiesOfContacts(deals);
    const groups = new Map<
        string,
        { client: DuplicateClientRef; deals: DuplicateDeal[] }
    >();
    for (const deal of deals) {
        const client = clientOf(deal, companyByContact);
        if (!client) continue;
        const key = clientKey(client);
        const group = groups.get(key) ?? { client, deals: [] };
        group.deals.push(deal);
        groups.set(key, group);
    }
    return [...groups.values()];
}

/**
 * Минус сделки исключённых сотрудников (тестовые, руководство): их сделок
 * нет в отчёте вовсе, и клиент, у которого осталась одна сделка, выпадает.
 */
export function excludeOwners(
    groups: readonly DuplicateGroup[],
    excludeUserIds: readonly number[],
): DuplicateGroup[] {
    if (!excludeUserIds.length) return [...groups];
    const excluded = new Set(excludeUserIds);
    return groups
        .map(group => ({
            client: group.client,
            deals: group.deals.filter(
                deal => !(deal.assignedById && excluded.has(deal.assignedById)),
            ),
        }))
        .filter(group => group.deals.length > 1);
}

/** Все ответственные сделок групп — для проверки «кто работает». */
export const responsibleIds = (groups: readonly DuplicateGroup[]): number[] => [
    ...new Set(
        groups.flatMap(group =>
            group.deals
                .map(deal => deal.assignedById)
                .filter((id): id is number => id !== null),
        ),
    ),
];

/** Группы + второй проход чтения → вход классификации. */
export function buildClientInputs(
    groups: readonly DuplicateGroup[],
    context: DuplicateContext,
): DuplicateClientInput[] {
    return groups.map(group => {
        const key = clientKey(group.client);
        const deals = group.deals.map(deal => {
            const tasks = context.openTasks.get(deal.id) ?? [];
            return {
                ...deal,
                openTasks: tasks.length,
                ownOpenTasks: tasks.filter(
                    task =>
                        deal.assignedById !== null &&
                        task.responsibleId === deal.assignedById,
                ).length,
                openTaskIds: tasks.map(task => task.id),
                lead: deal.sourceLeadId
                    ? (context.leads.get(deal.sourceLeadId) ?? null)
                    : null,
            };
        });
        return {
            ref: group.client,
            title: context.clientTitles.get(key) || fallbackTitle(group.client),
            inn: context.clientInns.get(key) || dealInns(deals).join(', '),
            deals,
        };
    });
}

/** Различные ИНН сделок клиента, по возрастанию. */
export const dealInns = (deals: readonly DuplicateDeal[]): string[] =>
    [...new Set(deals.map(deal => deal.inn).filter(Boolean))].sort();

const fallbackTitle = (ref: DuplicateClientRef): string =>
    ref.kind === 'company' ? `Компания ${ref.id}` : `Контакт ${ref.id}`;
