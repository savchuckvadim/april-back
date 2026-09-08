import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { AiService } from '@lib/call-lib';
import { PortalService } from '@lib/portal-lib/portal/portal.service';
import {
    EnumPortalAppCode,
    PortalAppSettingsPatch,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { parseAiLevels } from '@lib/sales-ai-analytics/settings/ai-settings.parse';
import type { AiSettingsKeyName } from '@lib/sales-ai-analytics/settings/ai-settings.types';
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

/** Что писать в ключи схемы: имя блока → JSON-строка (или скаляр-строка). */
export type AiSettingsPatch = Partial<Record<AiSettingsKeyName, string>>;

/** Имя блока Фазы 2 → ключ схемы `[kpiSales]` (camelCase, см. §3.3). */
const SETTINGS_SCHEMA_KEYS = {
    levels: 'aiAnalyticsLevels',
    targets: 'aiAnalyticsTargets',
    absences: 'aiAnalyticsAbsences',
    modelParams: 'aiAnalyticsModelParams',
    managerParams: 'aiAnalyticsManagerParams',
    definitions: 'aiAnalyticsDefinitions',
    events: 'aiAnalyticsEvents',
    scoring: 'aiAnalyticsScoring',
    hypothesis: 'aiAnalyticsHypothesis',
    rosterConfirmedAt: 'aiAnalyticsRosterConfirmedAt',
} as const satisfies Record<AiSettingsKeyName, string>;

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
 * Хранилище настроек витрины.
 *
 * Фаза 2: решения людей живут в ключах схемы `[kpiSales]`
 * (`savePortalSettings` → PortalAppSettingsService.save, кэш настроек
 * сбрасывается самим сервисом). Запись в ais (type =
 * ai-analytics-settings, activity_id = 'levels') остаётся **только как
 * одноразовый запасной путь переезда уровней**: пока ключ
 * `ai_analytics_levels` пуст, витрина читает старый снапшот
 * (`loadLevels`), иначе уже сохранённые уровни потерялись бы. Писать в
 * ais новые уровни больше не нужно — `saveLevels` сохранён для отката.
 */
@Injectable()
export class AiAnalyticsSettingsStore {
    constructor(
        private readonly aiService: AiService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly portals: PortalService,
    ) {}

    /**
     * Пишет блоки Фазы 2 в ключи схемы портала. Отсутствующий блок не
     * трогается (семантика PortalAppSettingsPatch), пустая строка —
     * «портал снял своё решение», но остаётся заданной явно.
     */
    async savePortalSettings(
        domain: string,
        patch: AiSettingsPatch,
    ): Promise<void> {
        const entries = Object.entries(patch).flatMap(([name, value]) =>
            value === undefined
                ? []
                : [[SETTINGS_SCHEMA_KEYS[name as AiSettingsKeyName], value]],
        );
        if (entries.length === 0) return;
        await this.appSettings.save(
            await this.resolvePortalId(domain),
            EnumPortalAppCode.kpiSales,
            Object.fromEntries(entries) as PortalAppSettingsPatch<
                typeof EnumPortalAppCode.kpiSales
            >,
        );
    }

    /** Id портала по домену: без него запись настроек невозможна. */
    async resolvePortalId(domain: string): Promise<number> {
        const portal = await this.portals.getPortalByDomain(domain);
        if (!portal?.id) {
            throw new NotFoundException(
                `Портал ${domain} не найден — настройки сохранять некуда`,
            );
        }
        return portal.id;
    }

    /** Сохраняет полный список уровней в ais; возвращает id записи. */
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

    /**
     * Уровни витрины: ключ схемы `ai_analytics_levels`, а при пустом
     * ключе — **одноразовый запасной путь переезда** на старый снапшот
     * `ai-analytics-settings`. Без него уровни, назначенные в Фазе 1b, в
     * день выката Фазы 2 просто исчезли бы: ключ пуст, а снапшот никто
     * больше не читает. Первое же сохранение заполняет ключ, и запасной
     * путь перестаёт срабатывать сам.
     */
    async loadLevels(
        domain: string,
    ): Promise<Map<number, AiManagerLevelRecord>> {
        const settings = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.kpiSales,
        );
        const fromSchema = parseAiLevels(settings.aiAnalyticsLevels);
        if (fromSchema.length > 0) {
            return new Map(
                fromSchema.map(level => [
                    level.managerId,
                    {
                        managerId: level.managerId,
                        level: level.level,
                        since: level.since,
                    },
                ]),
            );
        }

        return this.loadLegacyLevels(domain);
    }

    /** Уровни из ais-снапшота Фазы 1b (только запасной путь переезда). */
    async loadLegacyLevels(
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
