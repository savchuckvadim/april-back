/**
 * Типы стора снапшотов AI-аналитики (план Фазы 2 §3.2): запись, фильтр
 * выборки, опции и результаты upsert / prune. Вынесены из стора по
 * лимиту 300 строк; стор реэкспортирует их, прежние импорты не меняются.
 */
import type {
    AiAnalyticsSnapshotStatus,
    SnapshotEnvelope,
} from '@lib/sales-ai-analytics';

/** Снапшот, прочитанный из ais: конверт плюс поля записи. */
export interface AiAnalyticsSnapshotRecord<T = unknown>
    extends SnapshotEnvelope<T> {
    id: string;
    createdAt: Date;
    status: AiAnalyticsSnapshotStatus;
}

export interface AiAnalyticsSnapshotFilter {
    /**
     * Ключи периодов (activity_id); пусто — выборка окном created_at, и
     * тогда обязателен limit.
     */
    periodKeys?: readonly string[];
    /** Менеджеры (null — портальные записи); пусто — все. Фильтр в памяти. */
    managerIds?: readonly (string | null)[];
    /** Включать записи со status = 'superseded' (по умолчанию нет). */
    includeSuperseded?: boolean;
    /** Глубина окна created_at, дней (когда ключи неизвестны). */
    lookbackDays?: number;
    /** Момент отсчёта окна (по умолчанию — сейчас). */
    now?: Date;
    /**
     * Верхняя граница строк, которые стор берёт из ais, — самые свежие
     * по created_at/id; фильтры менеджера, статуса и latestOnly
     * применяются к ним уже в памяти. Обязателен без periodKeys
     * (план §3.2: индексы ais владельцем не подтверждены).
     */
    limit?: number;
    /** Одна актуальная запись на ключ periodKey + managerId — с максимальным id. */
    latestOnly?: boolean;
}

/** Опции выборок окном created_at (latest / prune). */
export type AiAnalyticsSnapshotWindowOptions = Pick<
    AiAnalyticsSnapshotFilter,
    'lookbackDays' | 'now' | 'limit'
>;

/** Опции широкой выборки месяцев менеджеров: limit обязателен. */
export interface AiAnalyticsManagerMonthsOptions {
    /** Верхняя граница строк выборки (см. AiAnalyticsSnapshotFilter.limit). */
    limit: number;
    /** Менеджеры; пусто — все. */
    managerIds?: readonly string[];
}

export interface AiAnalyticsSnapshotUpsertOptions {
    /**
     * Писать даже при совпадении сигнатуры (inputsHash + paramsVersion +
     * calcVersion) с актуальной записью ключа — принудительный пересчёт.
     */
    force?: boolean;
}

export interface AiAnalyticsSnapshotUpsertResult {
    /** id актуальной записи ключа: новой либо существующей при повторе. */
    id: string;
    /** id записей того же ключа, помеченных superseded. */
    supersededIds: string[];
    /** 1 — создана новая запись; 0 — повтор с той же сигнатурой, копия не создана. */
    written: 0 | 1;
}

export interface AiAnalyticsSnapshotPruneResult {
    /** id записей, выведенных из актуальных по ретенции. */
    retiredIds: string[];
    /** Сколько записей осталось актуальными. */
    kept: number;
}
