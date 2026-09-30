/**
 * Админ-чтение снапшотов Фазы 4 (волна B, поток B3): пул порталов,
 * связь качества с исходом, проверка точности прогноза отдела и эффект
 * советов — по домену, только из `ais` через read-only стор админки.
 * Писать и замещать эти записи может лишь конвейер приложения.
 *
 * Актуальная запись ключа — последняя не замещённая (status ≠ superseded);
 * среди ключей берётся самый поздний месяц. Запись чужой формы
 * пропускается (маппер вернул null), ручка не падает.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_LOOKBACK_DAYS,
    AI_ANALYTICS_SNAPSHOT_STATUS,
    AI_ANALYTICS_SNAPSHOT_TYPE,
    type AiAnalyticsSnapshotType,
} from '../../contracts/snapshot-kinds.const';
import {
    type AiAnalyticsAdminReadWindow,
    type AiAnalyticsAdminSnapshotRecord,
    AiAnalyticsAdminSnapshotStore,
} from '../ai-analytics-admin-snapshot.store';
import { AI_ANALYTICS_BACKTEST_HISTORY } from '../dto/ai-analytics-phase4-query.dto';
import {
    toBacktestView,
    toEffectView,
    toPoolView,
    toQualityLinkView,
} from './ai-analytics-phase4.mappers';
import type {
    Phase4ForecastBacktest,
    Phase4PoolStatus,
    Phase4QualityLink,
    Phase4RecommendationEffect,
} from './ai-analytics-phase4.types';

type Mapper<T> = (record: AiAnalyticsAdminSnapshotRecord) => T | null;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Запас окна created_at на месяц: снапшот закрытого месяца пишется уже
 * в следующем, самый длинный месяц — 31 день.
 */
const MONTH_WINDOW_DAYS = 31;

/**
 * Окно чтения истории на `months` месяцев: не короче стандартного окна
 * стора, иначе глубокая история (до 24 месяцев) молча обрезалась бы им.
 */
function historyWindow(months: number, now: Date): AiAnalyticsAdminReadWindow {
    const days = Math.max(
        AI_ANALYTICS_SNAPSHOT_LOOKBACK_DAYS,
        (months + 1) * MONTH_WINDOW_DAYS,
    );
    return { from: new Date(now.getTime() - days * DAY_MS) };
}

/** Маппер без падения: вложенные поля чужой формы — как «форма чужая». */
function safeMap<T>(
    map: Mapper<T>,
    record: AiAnalyticsAdminSnapshotRecord,
): T | null {
    try {
        return map(record);
    } catch {
        return null;
    }
}

/** Свежее первым: месяц по убыванию, внутри месяца — по created_at. */
function byMonthDesc(
    a: AiAnalyticsAdminSnapshotRecord,
    b: AiAnalyticsAdminSnapshotRecord,
): number {
    if (a.periodKey !== b.periodKey) {
        return a.periodKey < b.periodKey ? 1 : -1;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
}

@Injectable()
export class AiAnalyticsPhase4StatusService {
    constructor(private readonly store: AiAnalyticsAdminSnapshotStore) {}

    /** Последний снапшот пула портала: участники — обезличенно. */
    async poolStatus(domain: string): Promise<Phase4PoolStatus> {
        const [latest] = await this.readViews(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.pool,
            toPoolView,
            1,
        );
        return { domain, latest: latest ?? null };
    }

    /** Последний отчёт о связи качества с исходом (β). */
    async qualityLink(domain: string): Promise<Phase4QualityLink> {
        const [latest] = await this.readViews(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.qualityLink,
            toQualityLinkView,
            1,
        );
        return { domain, latest: latest ?? null };
    }

    /** Последние N проверок точности прогноза отдела, свежие первыми. */
    async forecastBacktest(
        domain: string,
        months: number = AI_ANALYTICS_BACKTEST_HISTORY.months,
        now: Date = new Date(),
    ): Promise<Phase4ForecastBacktest> {
        const items = await this.readViews(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest,
            toBacktestView,
            months,
            historyWindow(months, now),
        );
        return { domain, months, items };
    }

    /** Последний расчёт эффекта советов (гейт L5). */
    async recommendationEffect(
        domain: string,
    ): Promise<Phase4RecommendationEffect> {
        const [latest] = await this.readViews(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.recommendationEffect,
            toEffectView,
            1,
        );
        return { domain, latest: latest ?? null };
    }

    /**
     * Актуальные записи типа: по одной на месяц (последняя не
     * замещённая, читаемой формы), свежие месяцы первыми, не больше limit.
     */
    private async readViews<T>(
        domain: string,
        type: AiAnalyticsSnapshotType,
        map: Mapper<T>,
        limit: number,
        window: AiAnalyticsAdminReadWindow = {},
    ): Promise<T[]> {
        const records = await this.store.read(domain, [type], window);
        const seen = new Set<string>();
        const views: T[] = [];
        for (const record of [...records].sort(byMonthDesc)) {
            if (views.length >= limit) break;
            if (record.status === AI_ANALYTICS_SNAPSHOT_STATUS.superseded) {
                continue;
            }
            if (seen.has(record.periodKey)) continue;
            const view = safeMap(map, record);
            if (view === null) continue;
            seen.add(record.periodKey);
            views.push(view);
        }
        return views;
    }
}
