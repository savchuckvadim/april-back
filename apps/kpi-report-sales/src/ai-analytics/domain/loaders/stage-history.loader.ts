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
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import {
    AI_STAGE_HISTORY_ENTITY_TYPE_ID,
    AI_STAGE_HISTORY_ERROR_TTL_SECONDS,
    AI_STAGE_HISTORY_LIMITS,
    AI_STAGE_HISTORY_SKIP_REASONS,
    AI_STAGE_HISTORY_TTL_SECONDS,
    AI_STAGE_HISTORY_WINDOW_MONTHS,
    buildStageHistoryKey,
    stageHistoryFromDate,
} from '../../constants/ai-stage-history.const';
import {
    failedStageHistory,
    type StageHistoryLoadOptions,
    type StageHistoryWindowOptions,
    type StageHistoryResult,
} from './stage-history.contract';
import {
    buildSalesBaseStageDict,
    salesBaseCategoryOf,
    type SalesBaseStageDict,
    type StageHistoryPortal,
    toStageTransitionsByDict,
} from './stage-history.mapper';
import {
    advance,
    itemsOf,
    monthWindows,
    pageRequest,
    type BatchChunk,
    type HistoryWindow,
} from './stage-history.window';

export type {
    StageHistoryLoadOptions,
    StageHistoryResult,
    StageHistoryWindowOptions,
} from './stage-history.contract';
export { monthWindows } from './stage-history.window';

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
        const window = windowOf(options);
        const key = buildStageHistoryKey(
            domain,
            window.entityTypeId,
            window.fromDate,
            window.toDate,
            window.limit,
        );
        const cached = options.forceRefresh
            ? null
            : await this.cache.getJson<StageHistoryResult>(key);
        if (cached) return { ...cached, fromCache: true };

        const result = await this.fetch(domain, window);
        await this.store(key, result);

        return result;
    }

    /** Один инстанс на вызов: портал для лестницы, api — для батчей. */
    private async fetch(
        domain: string,
        options: StageHistoryWindowOptions,
    ): Promise<StageHistoryResult> {
        try {
            const { bitrix, PortalModel } = await this.pbx.init(domain);
            const portal: StageHistoryPortal = PortalModel;
            const category = salesBaseCategoryOf(portal);
            if (!category) {
                return failedStageHistory(
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

            return failedStageHistory(
                AI_STAGE_HISTORY_SKIP_REASONS.unavailable,
                message,
            );
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
        options: StageHistoryWindowOptions,
    ): Promise<StageHistoryResult> {
        const windows = openWindows(options);
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

/**
 * Окно выгрузки из запроса: тип сущности, границы и предел заданы явно —
 * дальше загрузчик работает только с разрешёнными значениями, а ключ кэша
 * строится из тех же полей (повтор за тот же день попадает в кэш).
 */
function windowOf(options: StageHistoryLoadOptions): StageHistoryWindowOptions {
    const toDate = options.toDate ?? new Date().toISOString().slice(0, 10);

    return {
        entityTypeId: options.entityTypeId ?? AI_STAGE_HISTORY_ENTITY_TYPE_ID,
        fromDate:
            options.fromDate ??
            stageHistoryFromDate(toDate, AI_STAGE_HISTORY_WINDOW_MONTHS),
        toDate,
        limit: Math.max(1, options.limit ?? AI_STAGE_HISTORY_LIMITS.maxRows),
        ...(options.fromId === undefined ? {} : { fromId: options.fromId }),
    };
}

/** Окна раунда: месяц на команду батча, курсор — с переданного `fromId`. */
function openWindows(options: StageHistoryWindowOptions): HistoryWindow[] {
    return monthWindows(options.fromDate, options.toDate).map(
        (window, index): HistoryWindow => ({
            ...window,
            cmd: `history_${index}`,
            ...(options.fromId === undefined ? {} : { lastId: options.fromId }),
            done: false,
        }),
    );
}
