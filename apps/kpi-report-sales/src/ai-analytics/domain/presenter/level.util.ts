/**
 * Уровень менеджера для строки обзора (план §2.2): назначенный РОПом —
 * manual; иначе default по стажу (< 6 мес. → junior, иначе middle; без
 * даты стажа — middle). Стаж — от since записи уровня до конца периода;
 * DATE_REGISTER пользователя Bitrix — Фаза 2.
 */
import {
    AI_ANALYTICS_DEFAULT_LEVEL,
    AI_ANALYTICS_JUNIOR_TENURE_MONTHS,
    AiAnalyticsLevelSource,
    AiAnalyticsManagerLevel,
} from '../../constants/ai-overview.const';
import type { AiManagerLevelRecord } from '../../store/ai-analytics-settings.store';

export interface ResolvedLevel {
    level: AiAnalyticsManagerLevel;
    levelSource: AiAnalyticsLevelSource;
    tenureMonths: number | null;
}

/** Полных месяцев между датами YYYY-MM-DD; отрицательное → 0. */
export function monthsBetween(since: string, until: string): number {
    const [sy, sm, sd] = since.split('-').map(Number);
    const [uy, um, ud] = until.split('-').map(Number);
    let months = (uy - sy) * 12 + (um - sm);
    if (ud < sd) months -= 1;
    return Math.max(0, months);
}

export function resolveLevel(
    record: AiManagerLevelRecord | undefined,
    until: string,
): ResolvedLevel {
    const tenureMonths = record?.since
        ? monthsBetween(record.since, until)
        : null;
    if (record) {
        return { level: record.level, levelSource: 'manual', tenureMonths };
    }
    const level: AiAnalyticsManagerLevel =
        tenureMonths !== null &&
        tenureMonths < AI_ANALYTICS_JUNIOR_TENURE_MONTHS
            ? 'junior'
            : AI_ANALYTICS_DEFAULT_LEVEL;
    return { level, levelSource: 'default', tenureMonths };
}
