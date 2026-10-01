import { compareFreshness } from '../../shared/lead-request/deal-freshness.util';
import {
    DUPLICATE_ACTION,
    DUPLICATE_DECIDE_REASON,
    DUPLICATE_ORIGIN,
    DUPLICATE_RECENT_WORK_DAYS,
    DuplicateDecideReason,
} from '../constants/duplicate-report.const';
import {
    ClassifiedClient,
    ClassifiedDeal,
    DuplicateClientInput,
    DuplicateDeal,
} from '../types/duplicate-report.types';
import { dealInns } from './duplicate-groups';
import { dealOrigin, hasOwnTitle } from './duplicate-origin';

export { dealOrigin, hasOwnTitle };

/**
 * РАЗБОР КЛИЕНТА С НЕСКОЛЬКИМИ ОТКРЫТЫМИ СДЕЛКАМИ — чистые функции.
 *
 * Правила перенесены из разового разбора дублей garant 30.09.2026
 * (ai/tasks/2026-09-30-duplicate-deals-report.md) без привязки к порталу:
 * ни дат перегона, ни id сотрудников — только данные самих сделок.
 * Время приходит параметром (`now`), а не берётся внутри: правила
 * проверяются тестами на фиксированных датах.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Вместо названия ИНН — так часто заводят сделку из загрузок баз. */
const INN_AS_TITLE = /^\d{10,12}$/;

export interface DuplicateClassifyOptions {
    /** «Сейчас», ms. */
    readonly now: number;
    /** Начало периода отчёта, ms: сделка не старше — «новое за неделю». */
    readonly periodStart: number;
    /** Конец периода (начало дня отчёта), ms, не включая. */
    readonly periodEnd: number;
    /** Кто из ответственных работает (ActiveStaffService). */
    readonly activeUserIds: ReadonlySet<number>;
    /** Пользователи интеграции (владелец вебхука): их сделки без лида — автоматика. */
    readonly systemUserIds: ReadonlySet<number>;
}

/** Нормальное название: своё и не ИНН вместо имени клиента. */
export const hasGoodTitle = (title: string): boolean =>
    hasOwnTitle(title) && !INN_AS_TITLE.test(title.trim());

/**
 * Очки «оставить основной». Порядок весов — из разбора 30.09: работающий
 * ответственный важнее всего, дальше стадия (дальше по воронке), сумма,
 * нормальное название. Открытые задачи — до пяти очков, только чтобы
 * развести равных: при присоединении задачи и дела переезжают в основную.
 */
export const mainDealScore = (deal: DuplicateDeal, working: boolean): number =>
    (working ? 1_000_000 : 0) +
    deal.stageOrder * 100 +
    (deal.opportunity > 0 ? 50 : 0) +
    (hasGoodTitle(deal.title) ? 20 : 0) +
    Math.min(deal.openTasks, 5);

/**
 * Ответственный ведёт сделку САМ: его открытые задачи по ней или его дело
 * не старше 30 дней. Не годятся: DATE_MODIFY (сдвигают роботы и наша
 * автоматика, в т.ч. аудит сделок), чужие задачи, привязанные к сделке, и
 * дела владельца вебхука (проба garant 01.10.2026: LAST_ACTIVITY_BY почти
 * везде — интеграция).
 */
export const isOwnRecentWork = (deal: DuplicateDeal, now: number): boolean =>
    deal.ownOpenTasks > 0 ||
    (deal.assignedById !== null &&
        deal.lastActivityById === deal.assignedById &&
        deal.lastActivityAt !== null &&
        now - deal.lastActivityAt <= DUPLICATE_RECENT_WORK_DAYS * DAY_MS);

/** Одна открытая задача привязана к двум сделкам клиента и больше. */
export const hasSharedTask = (deals: readonly DuplicateDeal[]): boolean => {
    const seen = new Set<number>();
    for (const deal of deals) {
        for (const id of new Set(deal.openTaskIds)) {
            if (seen.has(id)) return true;
            seen.add(id);
        }
    }
    return false;
};

interface DealFacts {
    readonly deal: DuplicateDeal;
    readonly working: boolean;
    readonly recentWork: boolean;
}

/** Разбор одного клиента: основная, самая свежая, кому решать, откуда дубль. */
export function classifyClient(
    input: DuplicateClientInput,
    options: DuplicateClassifyOptions,
): ClassifiedClient {
    const facts = input.deals.map(deal => factsOf(deal, options));
    const main = [...facts].sort(
        (a, b) =>
            mainDealScore(b.deal, b.working) -
                mainDealScore(a.deal, a.working) ||
            (b.deal.modifiedAt ?? 0) - (a.deal.modifiedAt ?? 0) ||
            a.deal.id - b.deal.id,
    )[0].deal;
    // Как у входа повторной заявки: к этой сделке уйдёт следующая заявка.
    const freshest = [...input.deals].sort((a, b) =>
        compareFreshness(
            { modifiedAtMs: a.modifiedAt, id: a.id },
            { modifiedAtMs: b.modifiedAt, id: b.id },
        ),
    )[0];
    const byAge = [...input.deals].sort(
        (a, b) =>
            (a.createdAt ?? Infinity) - (b.createdAt ?? Infinity) ||
            a.id - b.id,
    );
    const first = byAge[0];
    const youngest = byAge[byAge.length - 1];
    const origins = new Map(
        byAge
            .slice(1)
            .map(deal => [
                deal.id,
                dealOrigin(deal, first, input.deals, options.systemUserIds),
            ]),
    );
    const workedAsOne = hasSharedTask(input.deals);
    const reasons = decideReasons(facts, input.deals, workedAsOne);
    const ordered = [main, ...byAge.filter(deal => deal.id !== main.id)];
    const factById = new Map(facts.map(fact => [fact.deal.id, fact]));

    return {
        ref: input.ref,
        title: input.title,
        inn: input.inn,
        deals: ordered.map((deal): ClassifiedDeal => {
            const fact = factById.get(deal.id);
            return {
                deal,
                isMain: deal.id === main.id,
                isFreshest: deal.id === freshest.id,
                working: fact?.working ?? false,
                recentWork: fact?.recentWork ?? false,
                origin: origins.get(deal.id) ?? null,
            };
        }),
        mainDealId: main.id,
        freshestDealId: freshest.id,
        action: reasons.length
            ? DUPLICATE_ACTION.decide
            : DUPLICATE_ACTION.join,
        decideReasons: reasons,
        origin: origins.get(youngest.id) ?? DUPLICATE_ORIGIN.newRequest,
        newThisWeek:
            youngest.createdAt !== null &&
            youngest.createdAt >= options.periodStart &&
            youngest.createdAt < options.periodEnd,
        allResponsiblesGone: facts.every(fact => !fact.working),
        workedAsOne,
    };
}

/**
 * Все клиенты в порядке отчёта: сначала «решить руководителю», внутри —
 * новые за неделю, дальше по названию.
 */
export function classifyClients(
    inputs: readonly DuplicateClientInput[],
    options: DuplicateClassifyOptions,
): ClassifiedClient[] {
    return inputs
        .map(input => classifyClient(input, options))
        .sort(compareClients);
}

export const compareClients = (
    a: ClassifiedClient,
    b: ClassifiedClient,
): number =>
    actionRank(a) - actionRank(b) ||
    Number(b.newThisWeek) - Number(a.newThisWeek) ||
    a.title.localeCompare(b.title, 'ru');

const actionRank = (client: ClassifiedClient): number =>
    client.action === DUPLICATE_ACTION.decide ? 0 : 1;

const factsOf = (
    deal: DuplicateDeal,
    options: DuplicateClassifyOptions,
): DealFacts => ({
    deal,
    working:
        deal.assignedById !== null &&
        options.activeUserIds.has(deal.assignedById),
    recentWork: isOwnRecentWork(deal, options.now),
});

/**
 * Решение за руководителем, когда: у клиента двое РАБОТАЮЩИХ ответственных
 * и каждый ведёт свою сделку сам (молча присоединить — отобрать клиента у
 * одного из них), если только их не связывает общая задача — тогда клиента
 * уже ведут как одного; либо у сделок разные ИНН — возможно, это разные
 * организации, а присоединение необратимо смешивает их историю.
 */
const decideReasons = (
    facts: readonly DealFacts[],
    deals: readonly DuplicateDeal[],
    workedAsOne: boolean,
): DuplicateDecideReason[] => {
    const reasons: DuplicateDecideReason[] = [];
    const workers = new Set(
        facts
            .filter(fact => fact.working && fact.recentWork)
            .map(fact => fact.deal.assignedById),
    );
    if (workers.size >= 2 && !workedAsOne) {
        reasons.push(DUPLICATE_DECIDE_REASON.parallelWork);
    }
    if (dealInns(deals).length >= 2) {
        reasons.push(DUPLICATE_DECIDE_REASON.differentInn);
    }
    return reasons;
};
