/**
 * Политика ретенции снапшотов AI-аналитики (план Фазы 3, П5; решения
 * владельца B7/B10 от 22.09.2026): чистая функция «что удалить» по
 * дескрипторам типов `contracts/snapshot-descriptors.const.ts`. Сроки
 * хранения не задаются здесь и не дублируются: дескриптор — источник
 * истины (`snapshotRetention`), политика только применяет его к списку
 * записей.
 *
 * Правила:
 * 1. `forever` — не удаляется ничего (golden-report, settings-audit,
 *    rop-mark, feedback, settings);
 * 2. `days` — ключ периода просрочен, если ВСЕ его записи старше N дней
 *    от `now` по created_at (forecast 180, etl-run 90, brief 30);
 * 3. `records` — на субъекта (менеджер × тип) оставляем N самых свежих
 *    ключей периода, остальные ключи просрочены;
 * 4. просроченный ключ уходит целиком, ЖИВОЙ ключ отдаёт только версии
 *    сверх последних `keepVersions` (решение B10: `superseded` — две
 *    версии);
 * 5. у живого ключа актуальная запись (`status = done`) не удаляется
 *    никогда — иначе витрина потеряла бы текущий период; у просроченного
 *    ключа удаляется и она (иначе ретенция по числу записей не
 *    работала бы: у закрытых периодов ровно одна актуальная запись).
 *
 * Чистые функции: без DI, Bitrix и Prisma; время всегда параметром.
 */
import {
    AI_ANALYTICS_SNAPSHOT_TYPES,
    AiAnalyticsSnapshotType,
} from '../contracts/snapshot-kinds.const';
import { snapshotRetention } from '../contracts/snapshot-descriptors.const';

/** Сколько версий каждого ключа периода удерживаем сверх ретенции (B10). */
export const AI_ANALYTICS_RETENTION_KEEP_VERSIONS = 2;

/** Запись-кандидат: минимум колонок ais, нужный политике. */
export interface RetentionCandidate {
    id: string;
    type: AiAnalyticsSnapshotType;
    /** Ключ периода (колонка activity_id). */
    periodKey: string;
    /** Менеджер (колонка user_id); null — портальное зерно. */
    managerId: string | null;
    /** 'done' — актуальная запись ключа, 'superseded' — замещённая. */
    status: string;
    createdAt: Date;
}

/** Почему запись попала под удаление. */
export const RETENTION_REASONS = {
    /** Старше срока хранения типа в днях. */
    expiredDays: 'expired-days',
    /** Сверх числа записей, которое тип хранит на субъекта. */
    overCount: 'over-count',
    /** Лишняя версия ключа периода сверх keepVersions. */
    oldVersion: 'old-version',
} as const;
export type RetentionReason =
    (typeof RETENTION_REASONS)[keyof typeof RETENTION_REASONS];

/** Запись к удалению: id, тип, ключ и причина. */
export interface RetentionVictim {
    id: string;
    type: AiAnalyticsSnapshotType;
    periodKey: string;
    managerId: string | null;
    createdAt: Date;
    reason: RetentionReason;
}

/** Итог по типу: сколько просмотрено, сколько под удаление, срок хранения. */
export interface RetentionTypeSummary {
    type: AiAnalyticsSnapshotType;
    /** Единица ретенции дескриптора: records | days | forever. */
    unit: string;
    /** Число записей или дней; null при forever. */
    value: number | null;
    scanned: number;
    victims: number;
}

/** План ретенции: что удалить и сводка по типам. */
export interface RetentionPlan {
    victims: RetentionVictim[];
    byType: RetentionTypeSummary[];
    /** Всего просмотрено записей. */
    scanned: number;
    /** Всего под удаление. */
    total: number;
}

export interface RetentionPolicyOptions {
    /** Момент отсчёта сроков (время параметром, не `new Date()` внутри). */
    now: Date;
    /** Сколько версий ключа удерживать; по умолчанию 2 (решение B10). */
    keepVersions?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * План удаления по дескрипторам типов. Записи любых типов можно подавать
 * одним списком — политика сама группирует их по типу, субъекту и ключу.
 */
export function planRetention(
    records: readonly RetentionCandidate[],
    options: RetentionPolicyOptions,
): RetentionPlan {
    const keepVersions =
        options.keepVersions ?? AI_ANALYTICS_RETENTION_KEEP_VERSIONS;
    const victims: RetentionVictim[] = [];
    const byType: RetentionTypeSummary[] = [];
    for (const type of AI_ANALYTICS_SNAPSHOT_TYPES) {
        const ofType = records.filter(record => record.type === type);
        if (ofType.length === 0) continue;
        const retention = snapshotRetention(type);
        const typeVictims =
            retention.unit === 'forever' || retention.value === null
                ? []
                : collectVictims(ofType, retention, options.now, keepVersions);
        victims.push(...typeVictims);
        byType.push({
            type,
            unit: retention.unit,
            value: retention.value,
            scanned: ofType.length,
            victims: typeVictims.length,
        });
    }
    return {
        victims,
        byType,
        scanned: records.length,
        total: victims.length,
    };
}

/**
 * Кандидаты одного типа. Ключи периода делятся на просроченные (правило
 * типа) и живые: просроченный отдаёт все свои записи кроме актуальной,
 * живой — только версии сверх последних `keepVersions` (тоже кроме
 * актуальной).
 */
function collectVictims(
    records: readonly RetentionCandidate[],
    retention: { unit: string; value: number | null },
    now: Date,
    keepVersions: number,
): RetentionVictim[] {
    const expired =
        retention.unit === 'days'
            ? expiredByDays(records, retention.value ?? 0, now)
            : expiredByCount(records, retention.value ?? 0);
    const victims: RetentionVictim[] = [];
    for (const [key, group] of groupBy(records, versionKey)) {
        const sorted = [...group].sort(byCreatedAtDesc);
        const isExpired = expired.has(key);
        const dropped = isExpired
            ? sorted
            : sorted.slice(Math.max(keepVersions, 0));
        const reason = isExpired
            ? reasonOf(retention.unit)
            : RETENTION_REASONS.oldVersion;
        for (const record of dropped) {
            // У живого ключа актуальную запись не трогаем никогда.
            if (!isExpired && record.status === 'done') continue;
            victims.push(toVictim(record, reason));
        }
    }
    return victims;
}

/** Причина удаления по единице ретенции типа. */
function reasonOf(unit: string): RetentionReason {
    return unit === 'days'
        ? RETENTION_REASONS.expiredDays
        : RETENTION_REASONS.overCount;
}

/** Ключи, у которых ВСЕ записи старше N дней от `now`. */
function expiredByDays(
    records: readonly RetentionCandidate[],
    days: number,
    now: Date,
): Set<string> {
    const edge = now.getTime() - days * DAY_MS;
    const expired = new Set<string>();
    for (const [key, group] of groupBy(records, versionKey)) {
        if (newestOf(group) < edge) expired.add(key);
    }
    return expired;
}

/**
 * Ключи сверх N самых свежих на субъекта (менеджер × тип): свежесть
 * ключа — по самой свежей его записи.
 */
function expiredByCount(
    records: readonly RetentionCandidate[],
    keep: number,
): Set<string> {
    const expired = new Set<string>();
    for (const subject of groupBy(records, subjectKey).values()) {
        const keys = [...groupBy(subject, versionKey)].sort(
            (a, b) => newestOf(b[1]) - newestOf(a[1]),
        );
        for (const [key] of keys.slice(Math.max(keep, 0))) {
            expired.add(key);
        }
    }
    return expired;
}

function toVictim(
    record: RetentionCandidate,
    reason: RetentionReason,
): RetentionVictim {
    return {
        id: record.id,
        type: record.type,
        periodKey: record.periodKey,
        managerId: record.managerId,
        createdAt: record.createdAt,
        reason,
    };
}

const versionKey = (record: RetentionCandidate): string =>
    `${record.type}|${record.managerId ?? ''}|${record.periodKey}`;

const subjectKey = (record: RetentionCandidate): string =>
    `${record.type}|${record.managerId ?? ''}`;

function groupBy<T>(
    records: readonly T[],
    key: (record: T) => string,
): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const record of records) {
        const group = groups.get(key(record));
        if (group) group.push(record);
        else groups.set(key(record), [record]);
    }
    return groups;
}

function byCreatedAtDesc(a: RetentionCandidate, b: RetentionCandidate): number {
    return b.createdAt.getTime() - a.createdAt.getTime();
}

function newestOf(records: readonly RetentionCandidate[]): number {
    return records.reduce(
        (max, record) => Math.max(max, record.createdAt.getTime()),
        0,
    );
}
