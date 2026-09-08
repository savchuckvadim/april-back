/**
 * Загрузчик истории стадий сделок (план Фазы 2, поток 13 «p2-stage-history»,
 * P2-47): crm.stagehistory.list курсором `>ID` (order ID ASC, start -1)
 * окнами по месяцам, batch копится и отправляется НА ОДНОМ инстансе api
 * через callBatchWithConcurrency(1, { strict: true }).
 *
 * ⚠ `@Injectable` без bitrix-состояния: инстанс берётся на вызов
 * (`PBXService.init(domain)`) и живёт только внутри метода. Иначе соседний
 * домен перезаписал бы поле и накопленные команды уехали бы в чужой портал.
 * ⚠ Накопление и отправка батча — на ОДНОМ инстансе: `bitrix.batch.*` пишет
 * в очередь того же `bitrix.api`, которым она и отправляется.
 * ⚠ Штатная деградация (§5.4): нет прав на crm.stagehistory.list или не
 * настроена воронка sales_base → `ok: false` с причиной, а не исключение.
 * Ночной конвейер из-за истории стадий не падает никогда.
 *
 * Типы контракта — в `stage-history.contract.ts`, курсорная механика окон —
 * в `stage-history.window.ts`: здесь остаётся только оркестрация.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import type { BitrixService } from '@lib/bitrix';
import type { StageTransition } from '@lib/sales-ai-analytics';
import type {
    BxStageHistoryEntityTypeId,
    BxStageHistoryFilter,
    IBXStageHistoryItem,
    IBXStageHistoryListRequest,
} from '@lib/bitrix/domain/crm/stage-history';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import {
    AI_STAGE_HISTORY_ENTITY_TYPE_ID,
    AI_STAGE_HISTORY_ERROR_TTL_SECONDS,
    AI_STAGE_HISTORY_LIMITS,
    AI_STAGE_HISTORY_PAGE_SIZE,
    AI_STAGE_HISTORY_SKIP_REASONS,
    AI_STAGE_HISTORY_TTL_SECONDS,
    AI_STAGE_HISTORY_WINDOW_MONTHS,
    buildStageHistoryKey,
    stageHistoryFromDate,
    stageHistoryShiftMonths,
} from '../../constants/ai-stage-history.const';
import {
    buildSalesBaseStageDict,
    salesBaseCategoryOf,
    type SalesBaseStageDict,
    type StageHistoryPortal,
    toStageTransitionsByDict,
} from './stage-history.mapper';

/** Что грузим: тип сущности, окно, курсор и предел строк. */
export interface StageHistoryLoadOptions {
    /** Тип сущности Битрикс; по умолчанию сделка (entityTypeId = 2). */
    entityTypeId?: BxStageHistoryEntityTypeId;
    /** Читать записи с ID больше указанного (докачка окна). */
    fromId?: number;
    /** Начало окна 'YYYY-MM-DD'; по умолчанию — 12 месяцев назад от toDate. */
    fromDate?: string;
    /** Конец окна 'YYYY-MM-DD' (день прогона, входит в ключ кэша). */
    toDate?: string;
    /** Предел строк; по умолчанию AI_STAGE_HISTORY_LIMITS.maxRows. */
    limit?: number;
    /** Перечитать портал, игнорируя кэш. */
    forceRefresh?: boolean;
}

/** Результат выгрузки: переходы плюс всё, что нужно журналу прогона. */
export interface StageHistoryResult {
    /** Нормализованные переходы стадий лестницы sales_base. */
    transitions: StageTransition[];
    /** Прочитано записей истории (до маппинга). */
    rows: number;
    /** Отправлено HTTP-батчей — они же вызовы Битрикса в журнале. */
    bitrixCalls: number;
    /** Достигнут предел строк: окно прочитано не полностью. */
    truncated: boolean;
    /** История прочитана; false — метод недоступен либо нет воронки. */
    ok: boolean;
    /** Причина отказа (AI_STAGE_HISTORY_SKIP_REASONS); null — всё хорошо. */
    reason: string | null;
    /** Текст ошибки Битрикса для журнала; null — ошибки не было. */
    error: string | null;
    /** Максимальный прочитанный ID — курсор следующей докачки. */
    lastId: number | null;
    fromCache: boolean;
}

/** Окно выгрузки: границы дат и курсор последней прочитанной записи. */
interface HistoryWindow {
    cmd: string;
    from: string;
    to: string;
    lastId?: number;
    done: boolean;
}

/** Ответ батча в объёме, нужном загрузчику. */
type BatchChunk = { result?: Record<string, unknown> };

@Injectable()
export class StageHistoryLoader {
    private readonly logger = new Logger(StageHistoryLoader.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly cache: AiAnalyticsCacheService,
    ) {}

    /** История стадий окна: кэш → портал → нормализованные переходы. */
    async load(
        domain: string,
        options: StageHistoryLoadOptions = {},
    ): Promise<StageHistoryResult> {
        const entityTypeId =
            options.entityTypeId ?? AI_STAGE_HISTORY_ENTITY_TYPE_ID;
        const toDate = options.toDate ?? new Date().toISOString().slice(0, 10);
        const fromDate =
            options.fromDate ??
            stageHistoryFromDate(toDate, AI_STAGE_HISTORY_WINDOW_MONTHS);
        const limit = Math.max(
            1,
            options.limit ?? AI_STAGE_HISTORY_LIMITS.maxRows,
        );
        const key = buildStageHistoryKey(
            domain,
            entityTypeId,
            fromDate,
            toDate,
            limit,
        );
        const cached = options.forceRefresh
            ? null
            : await this.cache.getJson<StageHistoryResult>(key);
        if (cached) return { ...cached, fromCache: true };

        const result = await this.fetch(domain, {
            entityTypeId,
            fromDate,
            toDate,
            limit,
            ...(options.fromId === undefined ? {} : { fromId: options.fromId }),
        });
        await this.store(key, result);

        return result;
    }

    /** Один инстанс на вызов: портал для лестницы, api — для батчей. */
    private async fetch(
        domain: string,
        options: Required<
            Pick<
                StageHistoryLoadOptions,
                'entityTypeId' | 'fromDate' | 'toDate' | 'limit'
            >
        > &
            Pick<StageHistoryLoadOptions, 'fromId'>,
    ): Promise<StageHistoryResult> {
        try {
            const { bitrix, PortalModel } = await this.pbx.init(domain);
            const portal: StageHistoryPortal = PortalModel;
            const category = salesBaseCategoryOf(portal);
            if (!category) {
                return failed(
                    AI_STAGE_HISTORY_SKIP_REASONS.noCategory,
                    'Категория sales_base не настроена на портале',
                );
            }

            return await this.sweep(
                bitrix,
                buildSalesBaseStageDict(category),
                Number(category.bitrixId),
                options,
            );
        } catch (error) {
            const message = (error as Error).message;
            this.logger.warn(
                `История стадий не прочитана (${domain}): ${message}`,
            );

            return failed(AI_STAGE_HISTORY_SKIP_REASONS.unavailable, message);
        }
    }

    /**
     * Курсорный обход окон одним инстансом: раунд = батч по одной странице
     * на каждое незакрытое окно, курсор каждого окна двигается своим `>ID`.
     * Окно закрывается, когда страница неполная или курсор не сдвинулся.
     */
    private async sweep(
        bitrix: BitrixService,
        dict: SalesBaseStageDict,
        categoryId: number,
        options: Required<
            Pick<
                StageHistoryLoadOptions,
                'entityTypeId' | 'fromDate' | 'toDate' | 'limit'
            >
        > &
            Pick<StageHistoryLoadOptions, 'fromId'>,
    ): Promise<StageHistoryResult> {
        const windows = monthWindows(options.fromDate, options.toDate).map(
            (window, index): HistoryWindow => ({
                ...window,
                cmd: `history_${index}`,
                ...(options.fromId === undefined
                    ? {}
                    : { lastId: options.fromId }),
                done: false,
            }),
        );
        const transitions: StageTransition[] = [];
        let rows = 0;
        let bitrixCalls = 0;
        let lastId: number | null = null;
        let truncated = false;
        for (
            let round = 0;
            round < AI_STAGE_HISTORY_LIMITS.maxRounds;
            round += 1
        ) {
            const active = windows.filter(window => !window.done);
            if (active.length === 0 || rows >= options.limit) break;
            for (const window of active) {
                bitrix.batch.stageHistory.list(
                    window.cmd,
                    pageRequest(window, categoryId, options.entityTypeId),
                );
            }
            const chunks = (await bitrix.api.callBatchWithConcurrency(1, {
                strict: true,
            })) as BatchChunk[];
            bitrixCalls += chunks.length;
            for (const window of active) {
                const items = itemsOf(chunks, window.cmd);
                rows += items.length;
                transitions.push(...toStageTransitionsByDict(items, dict));
                const advanced = advance(window, items);
                if (advanced !== null) {
                    lastId =
                        lastId === null ? advanced : Math.max(lastId, advanced);
                }
            }
            truncated = rows >= options.limit;
        }

        return {
            transitions,
            rows,
            bitrixCalls,
            truncated: truncated || windows.some(window => !window.done),
            ok: true,
            reason: null,
            error: null,
            lastId,
            fromCache: false,
        };
    }

    /** Кэш окна: ошибочный результат живёт коротко, крупный не пишется. */
    private async store(
        key: string,
        result: StageHistoryResult,
    ): Promise<void> {
        if (
            result.ok &&
            result.transitions.length >
                AI_STAGE_HISTORY_LIMITS.cacheMaxTransitions
        ) {
            this.logger.warn(
                `Кэш ${key} не записан: ${result.transitions.length} переходов ` +
                    `больше предела ${AI_STAGE_HISTORY_LIMITS.cacheMaxTransitions}`,
            );

            return;
        }
        try {
            await this.cache.setJson(
                key,
                result,
                result.ok
                    ? AI_STAGE_HISTORY_TTL_SECONDS
                    : AI_STAGE_HISTORY_ERROR_TTL_SECONDS,
            );
        } catch (error) {
            this.logger.warn(
                `Кэш ${key} не записан: ${(error as Error).message}`,
            );
        }
    }
}

/** Отказ выгрузки: причина пропуска шага плюс текст для журнала. */
function failed(reason: string, error: string): StageHistoryResult {
    return {
        transitions: [],
        rows: 0,
        bitrixCalls: 0,
        truncated: false,
        ok: false,
        reason,
        error,
        lastId: null,
        fromCache: false,
    };
}

/** Запрос страницы окна: курсор `>ID`, order ID ASC, start -1. */
function pageRequest(
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
function itemsOf(
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
function advance(
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
