/**
 * Снапшоты Фазы 4 для модели портала и витрины (план §4.4, §4.8, §10):
 * последние связь качества, пул порталов, проверка точности прогноза и
 * эффект советов, плюс недельные точки менеджер × тип для сверхдисперсии.
 *
 * Загрузчик НЕ инжектируемый — создаётся поверх уже существующего стора
 * (`new Phase4SnapshotsLoader(store)`), как `OverviewSnapshotsLoader`, чтобы
 * не трогать модули приложения. Битрикс не зовётся: всё уже в `ais`.
 *
 * Деградация (§5.4): чужая форма или отказ стора по одному типу — null
 * только для него; витрина и модель остаются без ступени, но живы.
 */
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    isWorkday,
    shiftDate,
    type AiAnalyticsSnapshotType,
    type ForecastBacktestSnapshot,
    type OverdispersionPoint,
    type PoolSnapshot,
    type QualityLinkSnapshot,
    type RecommendationEffectSnapshot,
    type WorkCalendar,
} from '@lib/sales-ai-analytics';
import {
    monthBounds,
    monthKeysBack,
    weekMondayOfKey,
} from '../../constants/ai-manager-snapshot.const';
import { trendWeekKeys } from '../../constants/ai-trend.const';
import { AiAnalyticsSnapshotStore } from '../../store/ai-analytics-snapshot.store';
import type { AiAnalyticsSnapshotRecord } from '../../store/ai-analytics-snapshot.types';
import { latestPortalByPeriod } from '../../store/snapshot-latest-period.util';
import {
    isForecastBacktestSnapshot,
    isPoolSnapshot,
    isQualityLinkSnapshot,
    isRecommendationEffectSnapshot,
    phase4PayloadOf,
} from '../assembler/phase4-snapshot.guards';
import { isoWeekKey } from './period.util';

/**
 * Недель ряда для сверхдисперсии: полгода до конца месяца модели — вдвое
 * больше гейта оценки (12 недель), чтобы выпадение пары недель не
 * возвращало дефолт.
 */
export const AI_PORTAL_PHI_WEEKS = 26;

/**
 * Глубина поиска точности прогноза и эффекта советов для модели месяца:
 * год до месяца модели включительно. Старше — ступень считается без
 * снапшота («журнала ещё нет»), а не по устаревшему вердикту.
 */
export const AI_PORTAL_STAGE_LOOKBACK_MONTHS = 12;

/** Дней в ISO-неделе. */
const WEEK_DAYS = 7;

/** Последние снапшоты Фазы 4 портала; нет или чужая форма — null. */
export interface Phase4LatestSnapshots {
    forecastBacktest: ForecastBacktestSnapshot | null;
    recommendationEffect: RecommendationEffectSnapshot | null;
    qualityLink: QualityLinkSnapshot | null;
    pool: PoolSnapshot | null;
}

/** Рабочих дней ISO-недели по календарю портала. */
export function workdaysOfWeek(
    weekKey: string,
    calendar: WorkCalendar,
): number {
    const monday = weekMondayOfKey(weekKey);

    return Array.from({ length: WEEK_DAYS }, (_, index) =>
        shiftDate(monday, index),
    ).filter(day => isWorkday(day, calendar)).length;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

/**
 * Точки недели менеджера: по ячейке на тип звонка (`byType[].n`).
 * Экспозиция — рабочие дни недели по календарю: отсутствий по неделям в
 * снапшоте нет, поэтому неделя отпуска добавит разброса (φ завышается,
 * вилка прогноза шире — ошибка в безопасную сторону).
 */
export function weekPointsOf(
    managerId: string,
    payload: unknown,
    exposure: number,
): OverdispersionPoint[] {
    const cells = asRecord(payload)?.byType;
    if (!Array.isArray(cells) || exposure <= 0) return [];

    return (cells as unknown[]).flatMap((item): OverdispersionPoint[] => {
        const cell = asRecord(item);
        const count = cell?.n;
        const callType = cell?.callType;

        return typeof count === 'number' &&
            Number.isFinite(count) &&
            typeof callType === 'string'
            ? [{ count, exposure, cellKey: `${managerId}:${callType}` }]
            : [];
    });
}

export class Phase4SnapshotsLoader {
    constructor(private readonly snapshots: AiAnalyticsSnapshotStore) {}

    /**
     * Последние связь качества, пул, точность прогноза и эффект советов —
     * по максимальному месяцу записи, а не по времени записи: догон
     * истории пишет старые месяцы после свежих.
     */
    async loadLatest(domain: string): Promise<Phase4LatestSnapshots> {
        const [forecastBacktest, recommendationEffect, qualityLink, pool] =
            await Promise.all([
                this.latestOf(
                    domain,
                    AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest,
                    isForecastBacktestSnapshot,
                ),
                this.latestOf(
                    domain,
                    AI_ANALYTICS_SNAPSHOT_TYPE.recommendationEffect,
                    isRecommendationEffectSnapshot,
                ),
                this.latestOf(
                    domain,
                    AI_ANALYTICS_SNAPSHOT_TYPE.qualityLink,
                    isQualityLinkSnapshot,
                ),
                this.latestOf(
                    domain,
                    AI_ANALYTICS_SNAPSHOT_TYPE.pool,
                    isPoolSnapshot,
                ),
            ]);

        return { forecastBacktest, recommendationEffect, qualityLink, pool };
    }

    /**
     * Недельные точки менеджер × тип за полгода до конца месяца модели —
     * вход квази-пуассоновской φ. Выборка по ключам недель; пустые недели
     * (маркер без менеджера) отбрасываются. Отказ стора — пусто (φ по
     * реестру, как раньше).
     */
    async loadWeeklyActivity(
        domain: string,
        monthKey: string,
        calendar: WorkCalendar,
    ): Promise<OverdispersionPoint[]> {
        const weekKeys = trendWeekKeys(
            isoWeekKey(monthBounds(monthKey).to),
            AI_PORTAL_PHI_WEEKS,
        );
        try {
            const records = await this.snapshots.findByKeys(
                domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
                { periodKeys: weekKeys, latestOnly: true },
            );

            return records.flatMap(record =>
                record.managerId === null
                    ? []
                    : weekPointsOf(
                          record.managerId,
                          record.payload,
                          workdaysOfWeek(record.periodKey, calendar),
                      ),
            );
        } catch {
            return [];
        }
    }

    /**
     * Снапшоты Фазы 4 для модели месяца `monthKey` (месячный прогон, догон,
     * пересчёт одной модели): связь качества и пул — строго за этот месяц,
     * точность прогноза и эффект советов — самые поздние с ключом не позже
     * месяца модели (за год). «Последняя записанная» тут не годится: догон
     * пишет прошлые месяцы после текущего, и модель прошлого месяца взяла
     * бы вердикты из будущего, а повторный пересчёт дал бы другой итог.
     */
    async loadForMonth(
        domain: string,
        monthKey: string,
    ): Promise<Phase4LatestSnapshots> {
        const window = monthKeysBack(monthKey, AI_PORTAL_STAGE_LOOKBACK_MONTHS);
        const [forecastBacktest, recommendationEffect, qualityLink, pool] =
            await Promise.all([
                this.upToOf(
                    domain,
                    AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest,
                    window,
                    isForecastBacktestSnapshot,
                ),
                this.upToOf(
                    domain,
                    AI_ANALYTICS_SNAPSHOT_TYPE.recommendationEffect,
                    window,
                    isRecommendationEffectSnapshot,
                ),
                this.upToOf(
                    domain,
                    AI_ANALYTICS_SNAPSHOT_TYPE.qualityLink,
                    [monthKey],
                    isQualityLinkSnapshot,
                ),
                this.upToOf(
                    domain,
                    AI_ANALYTICS_SNAPSHOT_TYPE.pool,
                    [monthKey],
                    isPoolSnapshot,
                ),
            ]);

        return { forecastBacktest, recommendationEffect, qualityLink, pool };
    }

    private async latestOf<T>(
        domain: string,
        type: AiAnalyticsSnapshotType,
        guard: (value: unknown) => value is T,
    ): Promise<T | null> {
        try {
            const record = await latestPortalByPeriod(
                this.snapshots,
                domain,
                type,
            );

            return record === null
                ? null
                : phase4PayloadOf(record.payload, guard);
        } catch {
            return null;
        }
    }

    /** Портальная запись с самым поздним ключом из `periodKeys`; нет — null. */
    private async upToOf<T>(
        domain: string,
        type: AiAnalyticsSnapshotType,
        periodKeys: readonly string[],
        guard: (value: unknown) => value is T,
    ): Promise<T | null> {
        try {
            const records = await this.snapshots.findByKeys(domain, type, {
                periodKeys,
                managerIds: [null],
                latestOnly: true,
            });
            const record = records.reduce<AiAnalyticsSnapshotRecord | null>(
                (best, item) =>
                    best === null || item.periodKey >= best.periodKey
                        ? item
                        : best,
                null,
            );

            return record === null
                ? null
                : phase4PayloadOf(record.payload, guard);
        } catch {
            return null;
        }
    }
}
