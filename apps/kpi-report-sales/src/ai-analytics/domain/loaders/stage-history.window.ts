/**
 * Курсорная механика выгрузки истории стадий (план Фазы 2, поток 13):
 * окна по месяцам, запрос страницы окна и сдвиг курсора `>ID`.
 *
 * Вынесено из `stage-history.loader.ts`: загрузчик оркеструет (инстанс,
 * кэш, батч), а как устроена страница и когда окно закрывается — здесь.
 * Функции чистые, `new Date()` внутри нет: окна считаются от переданных дат.
 */
import type {
    BxStageHistoryEntityTypeId,
    BxStageHistoryFilter,
    IBXStageHistoryItem,
    IBXStageHistoryListRequest,
} from '@lib/bitrix/domain/crm/stage-history';
import {
    AI_STAGE_HISTORY_LIMITS,
    AI_STAGE_HISTORY_PAGE_SIZE,
    stageHistoryShiftMonths,
} from '../../constants/ai-stage-history.const';

/** Окно выгрузки: команда батча, границы дат и курсор последней записи. */
export interface HistoryWindow {
    cmd: string;
    from: string;
    to: string;
    lastId?: number;
    done: boolean;
}

/** Ответ батча в объёме, нужном загрузчику. */
export type BatchChunk = { result?: Record<string, unknown> };

/** Запрос страницы окна: курсор `>ID`, order ID ASC, start -1. */
export function pageRequest(
    window: HistoryWindow,
    categoryId: number,
    entityTypeId: BxStageHistoryEntityTypeId,
): IBXStageHistoryListRequest {
    const filter: BxStageHistoryFilter = {
        CATEGORY_ID: categoryId,
        '>=CREATED_TIME': window.from,
        '<CREATED_TIME': window.to,
        ...(window.lastId === undefined ? {} : { '>ID': window.lastId }),
    };

    return {
        entityTypeId,
        filter,
        order: { ID: 'ASC' },
        start: -1,
    };
}

/** Записи команды из ответов батча (чужая форма — пустой список). */
export function itemsOf(
    chunks: readonly BatchChunk[],
    cmd: string,
): IBXStageHistoryItem[] {
    for (const chunk of chunks) {
        const value = chunk?.result?.[cmd] as
            | { items?: IBXStageHistoryItem[] }
            | undefined;
        if (Array.isArray(value?.items)) return value.items;
    }

    return [];
}

/**
 * Сдвиг курсора окна: неполная страница закрывает окно; полная без роста
 * ID — тоже (иначе бесконечный цикл, как в BxStageHistoryRepository.listAll).
 */
export function advance(
    window: HistoryWindow,
    items: readonly IBXStageHistoryItem[],
): number | null {
    let lastId: number | null = null;
    for (const item of items) {
        const id = Number(item.ID);
        if (Number.isFinite(id))
            lastId = lastId === null ? id : Math.max(lastId, id);
    }
    const moved = lastId !== null && lastId !== window.lastId;
    if (moved) window.lastId = lastId ?? window.lastId;
    window.done = items.length < AI_STAGE_HISTORY_PAGE_SIZE || !moved;

    return lastId;
}

/**
 * Окна по месяцам: объём за 12 месяцев велик, поэтому история грузится
 * окнами, а окна одного раунда уезжают одним батчем. Конец окна не входит
 * в него (`<CREATED_TIME`), поэтому записи не задваиваются.
 */
export function monthWindows(
    fromDate: string,
    toDate: string,
): { from: string; to: string }[] {
    const windows: { from: string; to: string }[] = [];
    let cursor = fromDate;
    while (
        cursor < toDate &&
        windows.length < AI_STAGE_HISTORY_LIMITS.batchSize
    ) {
        const next = stageHistoryShiftMonths(cursor, 1);
        const to = next > toDate ? toDate : next;
        windows.push({ from: cursor, to });
        cursor = to;
    }

    return windows.length > 0
        ? windows
        : [{ from: fromDate, to: toDate > fromDate ? toDate : fromDate }];
}
