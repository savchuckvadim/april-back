import { IBXDeal } from '@/modules/bitrix';
import { dealsLinkedToBase } from '../init/linked-xo-deal';

/**
 * Перехват клиента отчётом «Звонков» (gsr 12.11.2026).
 *
 * Два режима:
 *  - `bot` — забирается работа ботов обзвона (`xo_start_bot_user_ids`,
 *    «Бот Манго»): бот не продаёт, он держит клиента до дозвона;
 *  - `force` — забирается работа ЛЮБОГО сотрудника и сделки без
 *    ответственного (`report_takeover_force`, при подтверждении — только
 *    после «Забрать себе»).
 * Без перехвата действует правило 25.08: чужую открытую сделку не трогаем.
 */
export type ClientTakeoverMode = 'bot' | 'force';

export interface ClientTakeover {
    mode: ClientTakeoverMode;
    /** Кому уходит работа — ответственный плана. */
    reporterId: number;
    /** Боты портала (в обоих режимах). */
    botOwnerIds: number[];
    /** Сделка коллеги/бота, которую забирает менеджер; null — у него своя основная. */
    takenDeal: IBXDeal | null;
    /** Прочие перехватываемые основные — закрываются в «Дубль». */
    duplicateDeals: IBXDeal[];
    /** Сделки ХО, ссылающиеся на дубли (`to_base_sales`). */
    duplicateXoDeals: IBXDeal[];
    /** Сделки коллег на защищённых стадиях: не забираются и не закрываются. */
    protectedDeals: IBXDeal[];
}

export interface ClientTakeoverInput {
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
    /** Перехват всей работы действует в этом отчёте. */
    force: boolean;
    /** Полные STAGE_ID защищённых стадий основной воронки. */
    protectedStageIds: ReadonlySet<string>;
    /** Кому уходит работа (ответственный плана); не задан — перехвата нет. */
    reporterId: number | null;
}

const ownerOf = (deal: IBXDeal): number => Number(deal.ASSIGNED_BY_ID) || 0;

/** Свежее — раньше: по дате изменения, при равенстве — больший ID. */
const freshestFirst = (a: IBXDeal, b: IBXDeal): number => {
    const byDate =
        (Date.parse(String(b.DATE_MODIFY ?? '')) || 0) -
        (Date.parse(String(a.DATE_MODIFY ?? '')) || 0);
    return byDate || Number(b.ID) - Number(a.ID);
};

/**
 * Чья работа перехватывается: у бота — всегда, у остальных — только в
 * режиме `force` (включая сделки без ответственного). Своя — никогда.
 */
export const isTakeoverOwner = (
    takeover: Pick<ClientTakeover, 'mode' | 'reporterId' | 'botOwnerIds'>,
    ownerId: number,
): boolean => {
    if (ownerId === takeover.reporterId) return false;
    return takeover.mode === 'force' || takeover.botOwnerIds.includes(ownerId);
};

/**
 * Что забрать и что закрыть.
 *
 *  - своя основная у менеджера есть → забирать нечего, перехватываемые
 *    основные — дубли;
 *  - основная — перехватываемая сделка (открыли из неё или отчитываются по
 *    задаче коллеги) → забирается она, прочие — дубли;
 *  - основной нет → забирается САМАЯ СВЕЖАЯ перехватываемая, прочие — дубли.
 * Сделки на защищённых стадиях не забираются и не закрываются (у ботов
 * защиты нет: бот не ведёт сделку до оплаты).
 *
 * null — делать нечего: перехват выключен, отчитывается бот, ответственный
 * не известен или перехватывать нечего.
 */
export const decideClientTakeover = (
    input: ClientTakeoverInput,
): ClientTakeover | null => {
    const bots = new Set(input.botOwnerIds);
    const reporterId = input.reporterId;
    if (!reporterId || bots.has(reporterId)) return null;
    if (!input.force && !bots.size) return null;

    const rules = {
        mode: (input.force ? 'force' : 'bot') as ClientTakeoverMode,
        reporterId,
        botOwnerIds: [...bots],
    };
    const takeable = (deal: IBXDeal): boolean =>
        isTakeoverOwner(rules, ownerOf(deal));
    const isProtected = (deal: IBXDeal): boolean =>
        !bots.has(ownerOf(deal)) &&
        input.protectedStageIds.has(String(deal.STAGE_ID));

    const current = input.currentBaseDeal;
    const others = input.baseDeals.filter(
        deal => takeable(deal) && String(deal.ID) !== String(current?.ID),
    );
    const protectedDeals = [
        ...(current && takeable(current) && isProtected(current)
            ? [current]
            : []),
        ...others.filter(isProtected),
    ];
    const candidates = others
        .filter(deal => !isProtected(deal))
        .sort(freshestFirst);

    const takenDeal = current
        ? takeable(current) && !isProtected(current)
            ? current
            : null
        : (candidates[0] ?? null);
    const duplicateDeals = candidates.filter(deal => deal !== takenDeal);
    if (!takenDeal && !duplicateDeals.length && !protectedDeals.length) {
        return null;
    }

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
        ...rules,
        takenDeal,
        duplicateDeals,
        duplicateXoDeals,
        protectedDeals,
    };
};
