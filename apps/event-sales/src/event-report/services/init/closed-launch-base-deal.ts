import { IBXDeal } from '@/modules/bitrix/domain/crm/deal/interface/bx-deal.interface';

/**
 * Сделка запуска «ОП Основная» закрыта, а менеджер из неё продолжает работу.
 *
 * Случай garant 06.10.2026: «Звонки» открыли из сделки, закрытой в отказ, и
 * запланировали звонок — отказная осталась закрытой, а рядом появилась новая
 * сделка (#95361 и #95375). В двух сделках клиента менеджер путается.
 *
 * Решение владельца:
 *  - вернуть закрытую в работу, если она закрыта именно провалом (отказ,
 *    «не ЦА», не отработан — не продажей) и других открытых сделок
 *    «ОП Основная» у клиента нет;
 *  - иначе работа уходит в другую сделку, как раньше, но об этом пишется в
 *    ленту обеих сделок и приходит уведомление.
 *
 * 30.10.2026 снято условие «сделка своя»: garant #28477 (сотрудник 459)
 * закрыта в отказ, руководитель запланировал доработку на 433 — рядом
 * выросла пустая #110153 без контактов. Чужую закрытую сделку теперь тоже
 * возвращаем в работу и переводим на нового ответственного: закрытая
 * сделка ничья, а дубль хуже смены ответственного.
 */
export interface ClosedLaunchBaseDealDecision {
    /** Вернуть в работу — она и станет основной сделкой отчёта. */
    reopen: IBXDeal | null;
    /** Остаётся закрытой, работа идёт в другой сделке — для записей о ней. */
    closed: IBXDeal | null;
}

const NONE: ClosedLaunchBaseDealDecision = { reopen: null, closed: null };

/** Семантика стадии Битрикса: P — в работе, S — успех, F — провал. */
const FAILED_SEMANTIC = 'F';

export const decideClosedLaunchBaseDeal = (input: {
    /** Сделка, из которой открыли приложение (crm.deal.get — со всеми полями). */
    launchDeal: IBXDeal | null;
    /** Битрикс-id категории «ОП Основная»; нет — решать нечего. */
    baseCategoryId: string | null;
    /** Открытые сделки клиента. */
    activeDeals: readonly IBXDeal[];
    /** Отчёт продолжает работу: не продажа и не отказ. */
    continuesWork: boolean;
}): ClosedLaunchBaseDealDecision => {
    const deal = input.launchDeal;
    if (!deal || !input.baseCategoryId || !input.continuesWork) return NONE;
    if (String(deal.CATEGORY_ID) !== input.baseCategoryId) return NONE;
    const closed = (deal as unknown as Record<string, unknown>)['CLOSED'];
    if (closed !== 'Y' && closed !== true) return NONE;

    const isFailed = deal.STAGE_SEMANTIC_ID === FAILED_SEMANTIC;
    const hasOpenBase = input.activeDeals.some(
        active => String(active.CATEGORY_ID) === input.baseCategoryId,
    );

    return isFailed && !hasOpenBase
        ? { reopen: deal, closed: null }
        : { reopen: null, closed: deal };
};

/**
 * Сделка запуска остаётся закрытой, а отчёт идёт из неё (якорь — она):
 * поля отчёта и привязка задачи ей не нужны — они уходят в новую сделку.
 * Иначе метки доработки и история вставали на закрытую (#28477), а у
 * задачи было две основные сделки.
 */
export const isClosedLaunchDealEntity = (ctx: {
    entityType: string;
    entityId: number;
    closedLaunchBaseDeal: IBXDeal | null;
}): boolean =>
    ctx.entityType === 'deal' &&
    !!ctx.closedLaunchBaseDeal &&
    Number(ctx.closedLaunchBaseDeal.ID) === Number(ctx.entityId);
