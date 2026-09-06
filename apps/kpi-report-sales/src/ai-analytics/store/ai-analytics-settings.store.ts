import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { AiService } from '@lib/call-lib';
import {
    AI_ANALYTICS_MANAGER_LEVELS,
    AI_ANALYTICS_SETTINGS_RECORD,
    AiAnalyticsManagerLevel,
} from '../constants/ai-overview.const';

/** Уровень менеджера, сохранённый РОПом. */
export interface AiManagerLevelRecord {
    managerId: number;
    level: AiAnalyticsManagerLevel;
    /** Дата начала стажа YYYY-MM-DD; null — не задана. */
    since: string | null;
}

/** user_result ais-записи настроек (набор levels). */
interface AiLevelsPayload {
    key: typeof AI_ANALYTICS_SETTINGS_RECORD.LEVELS_KEY;
    levels: AiManagerLevelRecord[];
    savedBy: string | null;
    savedAt: string;
}

const isLevel = (value: unknown): value is AiAnalyticsManagerLevel =>
    typeof value === 'string' &&
    (AI_ANALYTICS_MANAGER_LEVELS as readonly string[]).includes(value);

/** Разбор одной записи уровня из JSON; чужая форма → null. */
export function parseLevelRecord(raw: unknown): AiManagerLevelRecord | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const item = raw as Record<string, unknown>;
    const managerId = Number(item.managerId);
    if (!Number.isInteger(managerId) || managerId <= 0) return null;
    if (!isLevel(item.level)) return null;
    const since =
        typeof item.since === 'string' && item.since !== '' ? item.since : null;
    return { managerId, level: item.level, since };
}

/** user_result → список уровней; не наш payload → пусто. */
export function parseLevelsPayload(
    userResult: unknown,
): AiManagerLevelRecord[] {
    if (typeof userResult !== 'object' || userResult === null) return [];
    const raw = userResult as Record<string, unknown>;
    if (raw.key !== AI_ANALYTICS_SETTINGS_RECORD.LEVELS_KEY) return [];
    if (!Array.isArray(raw.levels)) return [];
    return raw.levels.flatMap(item => {
        const record = parseLevelRecord(item);
        return record ? [record] : [];
    });
}

/**
 * Хранилище настроек витрины в ais (временное решение Фазы 1b: ключей
 * ai_analytics_levels/targets/absences в схеме app-settings ещё нет,
 * план 5.1). Запись: type = ai-analytics-settings, app = provider =
 * ai-analytics, activity_id = ключ набора ('levels'); актуальна последняя
 * запись на ключ (findByDomainTypeKeys latestOnly). При появлении ключей
 * схемы стор меняется на PortalAppSettingsService без правки use-case'ов.
 */
@Injectable()
export class AiAnalyticsSettingsStore {
    constructor(private readonly aiService: AiService) {}

    /** Сохраняет полный список уровней; возвращает id ais. */
    async saveLevels(
        domain: string,
        levels: readonly AiManagerLevelRecord[],
        requesterUserId: string | null,
        now = new Date(),
    ): Promise<{ id: string; savedAt: string }> {
        const savedAt = now.toISOString();
        const payload: AiLevelsPayload = {
            key: AI_ANALYTICS_SETTINGS_RECORD.LEVELS_KEY,
            levels: levels.map(level => ({ ...level })),
            savedBy: requesterUserId,
            savedAt,
        };
        const created = await this.aiService.create({
            provider: AI_ANALYTICS_SETTINGS_RECORD.PROVIDER,
            app: AI_ANALYTICS_SETTINGS_RECORD.APP,
            type: AI_ANALYTICS_SETTINGS_RECORD.TYPE,
            status: 'done',
            activity_id: AI_ANALYTICS_SETTINGS_RECORD.LEVELS_KEY,
            result: `levels: ${levels.length}`,
            user_result: JSON.parse(
                JSON.stringify(payload),
            ) as Prisma.JsonValue,
            domain,
            ...(requesterUserId && Number.isInteger(Number(requesterUserId))
                ? { user_id: Number(requesterUserId) }
                : {}),
        });
        return { id: created.id, savedAt };
    }

    /** Последний сохранённый список уровней по managerId; пусто — не задавали. */
    async loadLevels(
        domain: string,
    ): Promise<Map<number, AiManagerLevelRecord>> {
        const records = await this.aiService.findByDomainTypeKeys(
            domain,
            AI_ANALYTICS_SETTINGS_RECORD.TYPE,
            { activityIds: [AI_ANALYTICS_SETTINGS_RECORD.LEVELS_KEY] },
            { latestOnly: true },
        );
        const latest = records[records.length - 1];
        const levels = latest ? parseLevelsPayload(latest.user_result) : [];
        return new Map(levels.map(level => [level.managerId, level]));
    }
}
