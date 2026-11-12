import { IBXDeal } from '@/modules/bitrix';
import { dealsLinkedToBase } from './linked-xo-deal';

/**
 * Перехват работы у сотрудников-ботов обзвона (`xo_start_bot_user_ids`,
 * gsr 12.11.2026: «Бот Манго»).
 *
 * На бота ставят холодный обзвон, автодозвон звонит клиенту; дозвонившийся
 * менеджер отчитывается в «Звонках» и забирает работу себе. Правило 25.08
 * («чужую открытую сделку не трогаем») для ботов не действует: бот не
 * продаёт, он держит клиента до дозвона.
 */
export interface BotTakeover {
    /** Сделка бота, которую забирает менеджер; null — у менеджера своя основная. */
    takenDeal: IBXDeal | null;
    /**
     * Прочие открытые основные сделки ботов клиента — закрываются дублями:
     * сделка, оставшаяся в стадии автодозвона, запускала бы звонки дальше.
     */
    duplicateDeals: IBXDeal[];
    /** Сделки ХО, ссылающиеся на дубли (`to_base_sales`), — закрываются с ними. */
    duplicateXoDeals: IBXDeal[];
    /** Боты портала: их открытые задачи по этим сделкам закрываются. */
    botOwnerIds: number[];
}

export interface BotTakeoverInput {
    /** Основная, выбранная по правилам отчёта (своя или сделка запуска). */
    currentBaseDeal: IBXDeal | null;
    /** Открытые основные сделки клиента. */
    baseDeals: readonly IBXDeal[];
    /** Все открытые сделки клиента — для поиска ХО-сделок дублей. */
    activeDeals: readonly IBXDeal[];
    xoCategoryId: string | null;
    /** UF-ключ ссылки на основную (`to_base_sales`). */
    linkKey: string;
    botOwnerIds: readonly number[];
    /** Кому уходит работа (ответственный плана); не задан — перехвата нет. */
    reporterId: number | null;
}

const ownerOf = (deal: IBXDeal): number => Number(deal.ASSIGNED_BY_ID);

/** Свежее — раньше: по дате изменения, при равенстве — больший ID. */
const freshestFirst = (a: IBXDeal, b: IBXDeal): number => {
    const byDate =
        (Date.parse(String(b.DATE_MODIFY ?? '')) || 0) -
        (Date.parse(String(a.DATE_MODIFY ?? '')) || 0);
    return byDate || Number(b.ID) - Number(a.ID);
};

/**
 * Что забрать у ботов и что закрыть.
 *
 *  - своя основная у менеджера есть → забирать нечего, сделки ботов — дубли;
 *  - основная — сделка бота (менеджер открыл приложение из неё или
 *    отчитывается по задаче бота) → её и забираем, прочие сделки ботов — дубли;
 *  - основной нет → забираем САМУЮ СВЕЖУЮ сделку бота, прочие — дубли.
 *
 * null — делать нечего: ботов нет в настройке, отчитывается сам бот,
 * ответственный не известен или сделок ботов у клиента нет.
 */
export const decideBotTakeover = (
    input: BotTakeoverInput,
): BotTakeover | null => {
    const bots = new Set(input.botOwnerIds);
    if (!bots.size || !input.reporterId || bots.has(input.reporterId)) {
        return null;
    }
    const current = input.currentBaseDeal;
    const currentIsBot = current ? bots.has(ownerOf(current)) : false;
    const botDeals = input.baseDeals
        .filter(deal => bots.has(ownerOf(deal)))
        .filter(deal => !current || String(deal.ID) !== String(current.ID))
        .sort(freshestFirst);

    const takenDeal = current
        ? currentIsBot
            ? current
            : null
        : (botDeals[0] ?? null);
    const duplicateDeals = botDeals.filter(deal => deal !== takenDeal);
    if (!takenDeal && !duplicateDeals.length) return null;

    const xoCategoryId = input.xoCategoryId;
    const duplicateXoDeals = xoCategoryId
        ? duplicateDeals.flatMap(base =>
              dealsLinkedToBase(
                  input.activeDeals,
                  input.linkKey,
                  base.ID,
              ).filter(deal => String(deal.CATEGORY_ID) === xoCategoryId),
          )
        : [];
    return {
        takenDeal,
        duplicateDeals,
        duplicateXoDeals,
        botOwnerIds: [...bots],
    };
};
