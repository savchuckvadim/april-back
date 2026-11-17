/**
 * Разложение прогноза отдела для админки (Фаза 4, п. 4.1): из чего сложилась
 * середина прогноза — закрытые продажи, ожидание от проведённых и от новых
 * презентаций (сделки — справочно), по отделу и по менеджерам. Нужно, чтобы найти,
 * откуда берётся завышение прогноза.
 *
 * Только чтение сохранённых снапшотов через read-only стор админки: ни
 * Битрикса, ни пересчёта. Берётся последний день журнала отдела и прогнозы
 * менеджеров за этот же день.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_STATUS,
    AI_ANALYTICS_SNAPSHOT_TYPE,
} from '../../contracts/snapshot-kinds.const';
import {
    type AiAnalyticsAdminSnapshotRecord,
    AiAnalyticsAdminSnapshotStore,
} from '../ai-analytics-admin-snapshot.store';
import {
    toDepartmentBreakdown,
    toManagerBreakdown,
} from './ai-analytics-forecast-breakdown.mapper';
import type {
    ForecastBreakdownDepartmentView,
    ForecastBreakdownManagerView,
    ForecastBreakdownView,
} from './ai-analytics-forecast-breakdown.types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Журнал месяца ищем не дальше стольких дней назад. */
const LOG_WINDOW_DAYS = 45;

/**
 * Прогнозы менеджеров за день пишутся ночью этого дня: читаем узкое окно
 * вокруг него (сутки запаса на часовой пояс портала), а не всю историю —
 * записей по менеджеру за день, их тысячи.
 */
const MANAGER_WINDOW_BEFORE_DAYS = 1;
const MANAGER_WINDOW_AFTER_DAYS = 2;

const isActive = (record: AiAnalyticsAdminSnapshotRecord): boolean =>
    record.status !== AI_ANALYTICS_SNAPSHOT_STATUS.superseded;

@Injectable()
export class AiAnalyticsForecastBreakdownService {
    constructor(private readonly store: AiAnalyticsAdminSnapshotStore) {}

    async breakdown(
        domain: string,
        now: Date = new Date(),
    ): Promise<ForecastBreakdownView> {
        const department = await this.department(domain, now);
        if (department === null) {
            return { domain, day: null, department: null, managers: [] };
        }
        return {
            domain,
            day: department.day,
            department,
            managers: await this.managers(domain, department.day),
        };
    }

    /** Последний день журнала прогноза отдела; журнала нет — null. */
    private async department(
        domain: string,
        now: Date,
    ): Promise<ForecastBreakdownDepartmentView | null> {
        const records = await this.store.read(
            domain,
            [AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog],
            { from: new Date(now.getTime() - LOG_WINDOW_DAYS * DAY_MS) },
            now,
        );
        let latest: ForecastBreakdownDepartmentView | null = null;
        for (const record of records.filter(isActive)) {
            const view = toDepartmentBreakdown(
                record.periodKey,
                record.payload,
            );
            if (view !== null && (latest === null || view.day > latest.day)) {
                latest = view;
            }
        }
        return latest;
    }

    /** Прогнозы менеджеров за день: по одному на менеджера, крупные первыми. */
    private async managers(
        domain: string,
        day: string,
    ): Promise<ForecastBreakdownManagerView[]> {
        const dayStart = Date.parse(`${day}T00:00:00.000Z`);
        if (!Number.isFinite(dayStart)) return [];
        const to = new Date(dayStart + MANAGER_WINDOW_AFTER_DAYS * DAY_MS);
        const records = await this.store.read(
            domain,
            [AI_ANALYTICS_SNAPSHOT_TYPE.forecast],
            {
                from: new Date(dayStart - MANAGER_WINDOW_BEFORE_DAYS * DAY_MS),
                to,
            },
            to,
        );
        const byManager = new Map<string, AiAnalyticsAdminSnapshotRecord>();
        for (const record of records.filter(isActive)) {
            if (record.periodKey !== day || record.managerId === null) continue;
            const known = byManager.get(record.managerId);
            if (!known || record.createdAt > known.createdAt) {
                byManager.set(record.managerId, record);
            }
        }
        return [...byManager.entries()]
            .map(([managerId, record]) =>
                toManagerBreakdown(managerId, record.payload),
            )
            .filter(
                (view): view is ForecastBreakdownManagerView => view !== null,
            )
            .sort(
                (a, b) =>
                    b.p50 - a.p50 || a.managerId.localeCompare(b.managerId),
            );
    }
}
