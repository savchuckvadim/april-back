/**
 * Контракт загрузчика истории стадий (план Фазы 2, поток 13
 * «p2-stage-history»): что у него просят, что он отдаёт и как выглядит
 * штатный отказ.
 *
 * Вынесено из `stage-history.loader.ts`, чтобы загрузчик остался в пределах
 * 300 строк и содержал только оркестрацию: типы контракта нужны и шагу
 * конвейера, и модели портала, а курсорная механика — нет.
 */
import type { BxStageHistoryEntityTypeId } from '@lib/bitrix/domain/crm/stage-history';
import type { StageTransition } from '@lib/sales-ai-analytics';

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

/** Окно выгрузки в разрешённом виде: границы и предел заданы. */
export type StageHistoryWindowOptions = Required<
    Pick<
        StageHistoryLoadOptions,
        'entityTypeId' | 'fromDate' | 'toDate' | 'limit'
    >
> &
    Pick<StageHistoryLoadOptions, 'fromId'>;

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

/**
 * Отказ выгрузки: причина пропуска шага плюс текст для журнала. Исключение
 * наружу не выходит — ночной конвейер из-за истории стадий не падает
 * никогда (§5.4 «штатная деградация»).
 */
export function failedStageHistory(
    reason: string,
    error: string,
): StageHistoryResult {
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
