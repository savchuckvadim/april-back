/**
 * Парсеры десяти ключей настроек портала (план Фазы 2, §3.3) — единая
 * точка входа: блоки «кто и сколько» разбираются здесь, блоки «как
 * считаем» — в `ai-settings.parse.model.ts` и реэкспортируются отсюда
 * (правило «файл ≤ 300 строк»).
 *
 * Контракт всех функций один: **битый JSON, чужая форма или пустая строка
 * дают дефолт кода, а не исключение**. Настройку правят руками в админке,
 * и упавший разбор погасил бы витрину целиком; отброшенное значение видно
 * в форме («портал ничего не решал»), а `settingsSanity` объясняет, что
 * именно не так. Чистые функции: без DI, Bitrix и Prisma.
 */
import { defaultLevelTarget, defaultTargets } from './ai-settings.defaults';
import {
    asArray,
    asFlag,
    asIsoDate,
    asNumberIn,
    asOneOf,
    asPositiveInt,
    asRecord,
    asText,
    parseJsonValue,
} from './ai-settings.json';
import {
    AI_ABSENCE_KINDS,
    AI_LEVEL_SOURCES,
    AI_MANAGER_LEVELS,
    AI_PORTAL_EVENT_KINDS,
    AI_PORTAL_EVENT_SOURCES,
    AI_SETTINGS_LIMITS,
    type AiAbsence,
    type AiAbsencesByManager,
    type AiManagerLevelSetting,
    type AiManagerParams,
    type AiManagerParamsByManager,
    type AiPortalEvent,
    type AiTargets,
} from './ai-settings.types';

export {
    parseAiDefinitions,
    parseAiHypothesis,
    parseAiModelParams,
    parseAiScoring,
} from './ai-settings.parse.model';

/** ISO-дни недели: 1 — понедельник … 7 — воскресенье. */
const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Одна запись уровня; чужая форма → null (запись отбрасывается). */
function parseLevel(raw: unknown): AiManagerLevelSetting | null {
    const item = asRecord(raw);
    const managerId = item && asPositiveInt(item.managerId);
    const level = item && asOneOf(item.level, AI_MANAGER_LEVELS);
    if (!item || !managerId || !level) return null;
    return {
        managerId,
        level,
        since: asIsoDate(item.since) ?? null,
        source: asOneOf(item.source, AI_LEVEL_SOURCES) ?? 'manual',
    };
}

/** `ai_analytics_levels` → уровни; дубли managerId схлопываются к первому. */
export function parseAiLevels(
    json: string | null | undefined,
): AiManagerLevelSetting[] {
    const seen = new Set<number>();
    return asArray(parseJsonValue(json)).flatMap(raw => {
        const level = parseLevel(raw);
        if (!level || seen.has(level.managerId)) return [];
        seen.add(level.managerId);
        return [level];
    });
}

/** Строка целей одного уровня поверх дефолта реестра. */
function parseLevelTarget(
    raw: unknown,
    level: (typeof AI_MANAGER_LEVELS)[number],
): AiTargets['byLevel'][typeof level] {
    const fallback = defaultLevelTarget(level);
    const item = asRecord(raw);
    if (!item) return fallback;
    const { targetSales, presentationsMin, coldPerDay } = AI_SETTINGS_LIMITS;
    return {
        sales: asNumberIn(item.sales, targetSales) ?? null,
        presentationsMin:
            asNumberIn(item.presentationsMin, presentationsMin) ??
            fallback.presentationsMin,
        coldPerDay:
            asNumberIn(item.coldPerDay, coldPerDay) ?? fallback.coldPerDay,
    };
}

/** `ai_analytics_targets` → цели по уровням и личные переопределения. */
export function parseAiTargets(json: string | null | undefined): AiTargets {
    const root = asRecord(parseJsonValue(json));
    if (!root) return defaultTargets();
    const byLevelRaw = asRecord(root.byLevel) ?? {};
    const byLevel = Object.fromEntries(
        AI_MANAGER_LEVELS.map(level => [
            level,
            parseLevelTarget(byLevelRaw[level], level),
        ]),
    ) as AiTargets['byLevel'];
    const overridesRaw = asRecord(root.overrides) ?? {};
    const overrides: Record<string, number | null> = {};
    for (const [managerId, value] of Object.entries(overridesRaw)) {
        if (!asPositiveInt(managerId)) continue;
        overrides[managerId] =
            asNumberIn(value, AI_SETTINGS_LIMITS.targetSales) ?? null;
    }
    return { byLevel, overrides };
}

/** Один отрезок отсутствия; from > to или чужая форма → null. */
function parseAbsence(raw: unknown): AiAbsence | null {
    const item = asRecord(raw);
    const from = item && asIsoDate(item.from);
    const to = item && asIsoDate(item.to);
    if (!item || !from || !to || from > to) return null;
    return { from, to, kind: asOneOf(item.kind, AI_ABSENCE_KINDS) ?? 'other' };
}

/** Отрезки одного менеджера, отсортированные по началу. */
function parseAbsences(raw: unknown): AiAbsence[] {
    return asArray(raw)
        .flatMap(item => {
            const absence = parseAbsence(item);
            return absence ? [absence] : [];
        })
        .sort((left, right) => left.from.localeCompare(right.from));
}

/** `ai_analytics_absences` → managerId → отрезки. */
export function parseAiAbsences(
    json: string | null | undefined,
): AiAbsencesByManager {
    const root = asRecord(parseJsonValue(json));
    if (!root) return {};
    const result: Record<string, readonly AiAbsence[]> = {};
    for (const [managerId, value] of Object.entries(root)) {
        if (!asPositiveInt(managerId)) continue;
        const absences = parseAbsences(value);
        if (absences.length > 0) result[managerId] = absences;
    }
    return result;
}

/** Флаговые поля слоя менеджера: имя в JSON = имя в типе. */
const MANAGER_FLAGS = [
    'excludeFromNorms',
    'alertsMuted',
    'digestEnabled',
] as const satisfies readonly (keyof AiManagerParams)[];

/** Слой одного менеджера; пустой результат отбрасывается вызывающим. */
function parseManagerParams(raw: unknown): AiManagerParams {
    const item = asRecord(raw);
    if (!item) return {};
    const params: AiManagerParams = {};
    const { fteShare, targetSales, presentationsMin } = AI_SETTINGS_LIMITS;
    const fte = asNumberIn(item.fteShare, fteShare);
    if (fte !== undefined) params.fteShare = fte;
    const absences = parseAbsences(item.absences);
    if (absences.length > 0) params.absences = absences;
    const override = asNumberIn(item.targetOverride, targetSales);
    if (item.targetOverride === null) params.targetOverride = null;
    else if (override !== undefined) params.targetOverride = override;
    const training = asNumberIn(
        item.trainingMinPresentations,
        presentationsMin,
    );
    if (training !== undefined) params.trainingMinPresentations = training;
    for (const flag of MANAGER_FLAGS) {
        const value = asFlag(item[flag]);
        if (value !== undefined) params[flag] = value;
    }
    const mentorUserId = asPositiveInt(item.mentorUserId);
    if (mentorUserId) params.mentorUserId = mentorUserId;
    const workweek = ISO_WEEKDAYS.filter(day =>
        asArray(item.workweek).includes(day),
    );
    if (workweek.length > 0) params.workweek = workweek;
    const timeZone = asText(item.timeZone);
    if (timeZone) params.timeZone = timeZone;
    return params;
}

/** `ai_analytics_manager_params` → managerId → слой менеджера. */
export function parseAiManagerParams(
    json: string | null | undefined,
): AiManagerParamsByManager {
    const root = asRecord(parseJsonValue(json));
    if (!root) return {};
    const result: Record<string, AiManagerParams> = {};
    for (const [managerId, value] of Object.entries(root)) {
        if (!asPositiveInt(managerId)) continue;
        const params = parseManagerParams(value);
        if (Object.keys(params).length > 0) result[managerId] = params;
    }
    return result;
}

/** Одна запись журнала; без даты или с чужим видом → null. */
function parseEvent(raw: unknown): AiPortalEvent | null {
    const item = asRecord(raw);
    const date = item && asIsoDate(item.date);
    const kind = item && asOneOf(item.kind, AI_PORTAL_EVENT_KINDS);
    if (!item || !date || !kind) return null;
    const note = asText(item.note);
    return {
        date,
        kind,
        ...(note ? { note } : {}),
        source: asOneOf(item.source, AI_PORTAL_EVENT_SOURCES) ?? 'manual',
    };
}

/** `ai_analytics_events` → журнал портала, отсортированный по дате. */
export function parseAiEvents(
    json: string | null | undefined,
): AiPortalEvent[] {
    return asArray(parseJsonValue(json))
        .flatMap(raw => {
            const event = parseEvent(raw);
            return event ? [event] : [];
        })
        .sort((left, right) => left.date.localeCompare(right.date));
}

/** `ai_analytics_roster_confirmed_at` → дата подтверждения либо ''. */
export function parseRosterConfirmedAt(
    value: string | null | undefined,
): string {
    return asIsoDate(typeof value === 'string' ? value.trim() : value) ?? '';
}
