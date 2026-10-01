import {
    DUPLICATE_ACTION,
    DUPLICATE_DECIDE_REASON,
    DUPLICATE_ORIGIN_LABEL,
} from '../constants/duplicate-report.const';
import {
    ClassifiedClient,
    ClassifiedDeal,
} from '../types/duplicate-report.types';
import { dealInns } from './duplicate-groups';

/**
 * Тексты отчёта для людей — одни на Excel, задачу и Telegram, чтобы
 * «что сделать» в файле и в задаче не расходились. Только русский язык,
 * без кодов и жаргона: читают руководители отделов продаж.
 */

export const plural = (
    count: number,
    one: string,
    few: string,
    many: string,
): string => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
};

/** «3 клиента», «1 сделка». */
export const countText = (
    count: number,
    one: string,
    few: string,
    many: string,
): string => `${count} ${plural(count, one, few, many)}`;

/** «А», «А и Б», «А, Б и В». */
export const joinRu = (items: readonly string[]): string =>
    items.length < 2
        ? (items[0] ?? '')
        : `${items.slice(0, -1).join(', ')} и ${items[items.length - 1]}`;

/** Имя сотрудника; нет в справочнике — честный номер. */
export const personName = (
    userId: number | null,
    names: ReadonlyMap<number, string>,
): string =>
    userId ? (names.get(userId) ?? `сотрудник ${userId}`) : 'не назначен';

/** Ответственный сделки с пометкой «(не работает)». */
export const responsibleLabel = (
    item: ClassifiedDeal,
    names: ReadonlyMap<number, string>,
): string =>
    personName(item.deal.assignedById, names) +
    (item.working ? '' : ' (не работает)');

/** Основная сделка клиента (по построению — первая в списке). */
export const mainOf = (client: ClassifiedClient): ClassifiedDeal =>
    client.deals.find(item => item.isMain) ?? client.deals[0];

/** Остальные сделки клиента — те, что предлагается присоединить. */
export const othersOf = (client: ClassifiedClient): ClassifiedDeal[] =>
    client.deals.filter(item => !item.isMain);

/** «Как появилась» по-русски; у первой сделки клиента — её роль. */
export const originLabel = (item: ClassifiedDeal): string =>
    item.origin ? DUPLICATE_ORIGIN_LABEL[item.origin] : 'первая сделка клиента';

/** Роль сделки в строке «Все сделки». */
export const dealRoleLabel = (
    client: ClassifiedClient,
    item: ClassifiedDeal,
): string => {
    if (client.action === DUPLICATE_ACTION.decide) {
        return item.isMain ? 'решить: дальше по воронке' : 'решить';
    }
    return item.isMain ? 'основная' : 'присоединить';
};

/**
 * «Как вели» клиента — как в разборе 30.09: общая задача на сделки — уже
 * ведут как одного; один ответственный; кто из ответственных ведёт сам.
 */
export function howWorkedText(
    client: ClassifiedClient,
    names: ReadonlyMap<number, string>,
): string {
    if (client.workedAsOne) {
        return 'как одного клиента: общая открытая задача на сделки';
    }
    const owners = new Set(client.deals.map(item => item.deal.assignedById));
    if (owners.size === 1) {
        return `один ответственный — ${personName(client.deals[0].deal.assignedById, names)}`;
    }
    const workers = [
        ...new Set(
            client.deals
                .filter(item => item.recentWork)
                .map(item => personName(item.deal.assignedById, names)),
        ),
    ];
    if (!workers.length) return 'своей работы не видно ни у кого';
    if (workers.length === 1) {
        return `ведёт ${workers[0]}, у остальных своей работы не видно`;
    }
    return `параллельно: ${joinRu(workers)}`;
}

/**
 * Коротко «что сделать» — для таблицы в задаче. Разные ИНН — отдельно:
 * до проверки присоединять нельзя, и это должно быть видно в строке.
 */
export const shortActionText = (client: ClassifiedClient): string => {
    if (client.decideReasons.includes(DUPLICATE_DECIDE_REASON.differentInn)) {
        return 'проверить ИНН';
    }
    return client.action === DUPLICATE_ACTION.decide
        ? 'решить руководителю'
        : `присоединить к ${mainOf(client).deal.id}`;
};

/** Полный текст «что сделать» с именами — для Excel. */
export function actionText(
    client: ClassifiedClient,
    names: ReadonlyMap<number, string>,
): string {
    const parts: string[] = [];
    if (client.decideReasons.includes(DUPLICATE_DECIDE_REASON.parallelWork)) {
        const workers = [
            ...new Set(
                client.deals
                    .filter(item => item.working && item.recentWork)
                    .map(item => personName(item.deal.assignedById, names)),
            ),
        ];
        parts.push(
            `Решить, кто ведёт клиента: работают ${joinRu(workers)}. ` +
                'Потом присоединить остальные сделки к сделке того, кто ведёт.',
        );
    }
    if (client.decideReasons.includes(DUPLICATE_DECIDE_REASON.differentInn)) {
        const inns = dealInns(client.deals.map(item => item.deal));
        parts.push(
            `Проверить ИНН: у сделок разные (${inns.join(', ')}) — возможно, ` +
                'это разные организации. Присоединять только после проверки.',
        );
    }
    if (!parts.length) {
        const main = mainOf(client);
        const others = othersOf(client).map(item => item.deal.id);
        parts.push(
            `Присоединить ${others.join(', ')} к ${main.deal.id} ` +
                `(${personName(main.deal.assignedById, names)}).`,
        );
    }
    if (client.allResponsiblesGone) {
        parts.push('Все ответственные не работают — назначить работающего.');
    }
    return parts.join(' ');
}
