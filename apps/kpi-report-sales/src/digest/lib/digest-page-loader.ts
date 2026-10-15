/**
 * Постраничная выгрузка списочных методов Битрикса одним батчем.
 *
 * Первый вызов отдаёт страницу и `total`; остальные страницы — команды
 * `start=N*50` в одном strict-батче (50 команд на HTTP-запрос — до 2500
 * строк за один поход). Порядок по ID: новые строки появляются в конце,
 * offset-страницы не плывут, пока идёт выгрузка.
 *
 * Громкие ошибки: страница без `result` (дроп rate-limiter) и пропавшая
 * команда батча — исключение, а не тихо неполная партиция
 * (инцидент 2026-07-27/28).
 */
import type { BitrixBaseApi } from '@lib/bitrix';
import {
    assertBatchComplete,
    mergeBatchResults,
} from '../../shared/lib/batch-completeness.util';
import { KPI_DIGEST_LIST_PAGE_SIZE } from '../constants/digest.const';

export const LISTS_ELEMENT_GET_METHOD = 'lists.element.get';
export const CRM_DEAL_LIST_METHOD = 'crm.deal.list';

export class DigestPageDroppedError extends Error {
    constructor(method: string, pageStart: number, context: string) {
        super(
            `${method}: страница start=${pageStart} (${context}) потеряна — ` +
                'ответ без массива result (дроп rate-limiter или обрыв). ' +
                'Данные были бы неполными, расчёт остановлен.',
        );
        this.name = 'DigestPageDroppedError';
    }
}

export type ListElementRow = Record<string, unknown>;

export interface PagedQuery {
    method: string;
    /** Параметры метода без `start` (filter/select/order). */
    params: Record<string, unknown>;
    /** Предохранитель объёма: больше — truncated. */
    cap: number;
    /** Контекст для сообщений об ошибках. */
    context: string;
}

export interface PagedResult {
    rows: ListElementRow[];
    /** Сколько строк подходит под фильтр по данным Битрикса. */
    total: number;
    truncated: boolean;
}

interface PagedEnvelope {
    result?: unknown;
    total?: unknown;
}

export type ListElementsApi = Pick<
    BitrixBaseApi,
    'call' | 'addCmdBatch' | 'callBatchWithConcurrency'
>;

const pageKey = (start: number): string => `page_${start}`;

export async function loadPaged(
    api: ListElementsApi,
    query: PagedQuery,
): Promise<PagedResult> {
    const first = (await api.call(query.method, {
        ...query.params,
        start: 0,
    })) as PagedEnvelope | null | undefined;
    if (!first || typeof first !== 'object' || !Array.isArray(first.result)) {
        throw new DigestPageDroppedError(query.method, 0, query.context);
    }

    const rows: ListElementRow[] = [...(first.result as ListElementRow[])];
    const reportedTotal = Number(first.total);
    const total =
        Number.isFinite(reportedTotal) && reportedTotal >= rows.length
            ? reportedTotal
            : rows.length;
    const limit = Math.min(total, query.cap);

    const starts: number[] = [];
    for (
        let start = KPI_DIGEST_LIST_PAGE_SIZE;
        start < limit;
        start += KPI_DIGEST_LIST_PAGE_SIZE
    ) {
        starts.push(start);
    }

    if (starts.length) {
        for (const start of starts) {
            api.addCmdBatch(pageKey(start), query.method, {
                ...query.params,
                start,
            });
        }
        const merged = mergeBatchResults(
            await api.callBatchWithConcurrency(1, { strict: true }),
        );
        const keys = starts.map(pageKey);
        assertBatchComplete(merged, keys, query.context);
        for (const [index, key] of keys.entries()) {
            const page = merged.result[key];
            if (!Array.isArray(page)) {
                throw new DigestPageDroppedError(
                    query.method,
                    starts[index],
                    query.context,
                );
            }
            rows.push(...(page as ListElementRow[]));
        }
    }

    return {
        rows: rows.slice(0, query.cap),
        total,
        truncated: total > query.cap,
    };
}

export interface ListElementsQuery {
    listId: string;
    filter: Record<string, unknown>;
    select: string[];
    cap: number;
    context: string;
}

/** Элементы списка (lists.element.get) по фильтру. */
export async function loadListElements(
    api: ListElementsApi,
    query: ListElementsQuery,
): Promise<PagedResult> {
    return loadPaged(api, {
        method: LISTS_ELEMENT_GET_METHOD,
        params: {
            IBLOCK_TYPE_ID: 'lists',
            IBLOCK_ID: query.listId,
            filter: query.filter,
            select: query.select,
            ELEMENT_ORDER: { ID: 'ASC' },
        },
        cap: query.cap,
        context: query.context,
    });
}

/** Сделки (crm.deal.list) по фильтру. */
export async function loadDeals(
    api: ListElementsApi,
    filter: Record<string, unknown>,
    select: string[],
    cap: number,
    context: string,
): Promise<PagedResult> {
    return loadPaged(api, {
        method: CRM_DEAL_LIST_METHOD,
        params: { filter, select, order: { ID: 'ASC' } },
        cap,
        context,
    });
}
