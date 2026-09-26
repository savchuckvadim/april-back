/**
 * Уровень и стаж менеджера для строки обзора (план §2.2, §4.6) — то же
 * правило, что у ночного конвейера (`buildLevelFacts` месячного снапшота):
 *
 * 1. Назначенный РОПом уровень (`ai_analytics_levels`) — `manual`, всегда
 *    побеждает. Дата стажа — since записи, а без неё — дата паспорта.
 * 2. Иначе уровень паспорта менеджера из месячного снапшота (полоса стажа
 *    по каскаду UF_EMPLOYMENT_DATE → DATE_REGISTER → первое событие) —
 *    `passport`; стаж — из паспорта.
 * 3. Иначе дефолт по стажу (< 6 мес. → junior, иначе middle; без даты
 *    стажа — middle) — `default`.
 *
 * Паспорт снимка, чей уровень был ручным на момент прогона, а ручной
 * записи сейчас нет, отдаёт подсказку своей же полосы стажа
 * (`levelByTenureBand`): снятое РОПом назначение не воскресает. Паспорт
 * без полосы стажа (дата начала не найдена) уровня не знает — его
 * «middle» и есть дефолт кода, поэтому строка честно остаётся `default`.
 */
import {
    AI_PASSPORT_SINCE_SOURCES,
    isAiTenureBand,
    levelByTenureBand,
} from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_DEFAULT_LEVEL,
    AI_ANALYTICS_JUNIOR_TENURE_MONTHS,
    AI_ANALYTICS_MANAGER_LEVELS,
    AiAnalyticsLevelSource,
    AiAnalyticsManagerLevel,
    AiAnalyticsSinceSource,
} from '../../constants/ai-overview.const';
import type { AiManagerLevelRecord } from '../../store/ai-analytics-settings.store';
import type { ManagerPassportFacts } from '../assembler/manager-snapshot.types';

/** Паспорт глазами строки: поля, из которых конвейер берёт уровень. */
export type LevelPassport = Pick<
    ManagerPassportFacts,
    | 'since'
    | 'sinceSource'
    | 'level'
    | 'levelSource'
    | 'tenureMonths'
    | 'tenureBand'
>;

/** Дата начала стажа и её источник; null — даты нет нигде. */
export interface ResolvedTenure {
    since: string | null;
    sinceSource: AiAnalyticsSinceSource | null;
}

export interface ResolvedLevel extends ResolvedTenure {
    level: AiAnalyticsManagerLevel;
    levelSource: AiAnalyticsLevelSource;
    tenureMonths: number | null;
}

const MANUAL_SOURCE = 'manual';

/** Полных месяцев между датами YYYY-MM-DD; отрицательное → 0. */
export function monthsBetween(since: string, until: string): number {
    const [sy, sm, sd] = since.split('-').map(Number);
    const [uy, um, ud] = until.split('-').map(Number);
    let months = (uy - sy) * 12 + (um - sm);
    if (ud < sd) months -= 1;
    return Math.max(0, months);
}

const isManagerLevel = (
    value: string | null,
): value is AiAnalyticsManagerLevel =>
    (AI_ANALYTICS_MANAGER_LEVELS as readonly (string | null)[]).includes(value);

/** Источник даты паспорта из справочника; чужое значение — null. */
function passportSinceSource(
    value: string | null,
): AiAnalyticsSinceSource | null {
    return AI_PASSPORT_SINCE_SOURCES.find(source => source === value) ?? null;
}

/** Стаж: since записи РОПа, иначе дата паспорта с её источником. */
export function resolveTenure(
    record: AiManagerLevelRecord | undefined,
    passport: LevelPassport | null,
): ResolvedTenure {
    if (record?.since) {
        return { since: record.since, sinceSource: MANUAL_SOURCE };
    }
    const since = passport?.since ?? null;
    return {
        since,
        sinceSource:
            since === null
                ? null
                : passportSinceSource(passport?.sinceSource ?? null),
    };
}

/**
 * Уровень паспорта без ручной записи: подсказка паспорта как есть; если
 * снимок нёс ручной уровень — подсказка его полосы стажа. Полосы нет —
 * null (дальше дефолт): без стажа паспорт отдаёт `levelByTenureBand(null)`
 * = middle, то есть тот же дефолт кода, и метка `passport` соврала бы.
 */
function passportLevelOf(
    passport: LevelPassport | null,
): AiAnalyticsManagerLevel | null {
    if (passport === null || !isAiTenureBand(passport.tenureBand)) {
        return null;
    }
    if (passport.levelSource === MANUAL_SOURCE) {
        return levelByTenureBand(passport.tenureBand);
    }
    return isManagerLevel(passport.level) ? passport.level : null;
}

/** Дефолт по стажу: короче AI_ANALYTICS_JUNIOR_TENURE_MONTHS → junior. */
function defaultLevelOf(tenureMonths: number | null): AiAnalyticsManagerLevel {
    return tenureMonths !== null &&
        tenureMonths < AI_ANALYTICS_JUNIOR_TENURE_MONTHS
        ? 'junior'
        : AI_ANALYTICS_DEFAULT_LEVEL;
}

export function resolveLevel(
    record: AiManagerLevelRecord | undefined,
    until: string,
    passport: LevelPassport | null = null,
): ResolvedLevel {
    const tenure = resolveTenure(record, passport);
    const tenureMonths =
        tenure.since === null ? null : monthsBetween(tenure.since, until);
    if (record) {
        return {
            level: record.level,
            levelSource: MANUAL_SOURCE,
            tenureMonths,
            ...tenure,
        };
    }
    const fromPassport = passportLevelOf(passport);
    if (fromPassport !== null) {
        return {
            level: fromPassport,
            levelSource: 'passport',
            tenureMonths: passport?.tenureMonths ?? tenureMonths,
            ...tenure,
        };
    }
    return {
        level: defaultLevelOf(tenureMonths),
        levelSource: 'default',
        tenureMonths,
        ...tenure,
    };
}
