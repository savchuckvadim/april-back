import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { AiEntityDto, AiService } from '@lib/call-lib';
import {
    AI_ANALYTICS_SNAPSHOT_LOOKBACK_DAYS,
    AI_ANALYTICS_SNAPSHOT_STATUS,
    AiAnalyticsSnapshotStatus,
    AiAnalyticsSnapshotType,
    SnapshotEnvelope,
    snapshotRetention,
} from '@lib/sales-ai-analytics';
import {
    fromAisRecord,
    parseSnapshotStatus,
    toAisRecord,
} from './snapshot-serialize.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Снапшот, прочитанный из ais: конверт плюс поля записи. */
export interface AiAnalyticsSnapshotRecord<T = unknown>
    extends SnapshotEnvelope<T> {
    id: string;
    createdAt: Date;
    status: AiAnalyticsSnapshotStatus;
}

export interface AiAnalyticsSnapshotFilter {
    /** Ключи периодов (activity_id); пусто — выборка по окну created_at. */
    periodKeys?: readonly string[];
    /** Менеджеры (null — портальные записи); пусто — все. */
    managerIds?: readonly (string | null)[];
    /** Включать записи со status = 'superseded' (по умолчанию нет). */
    includeSuperseded?: boolean;
    /** Глубина окна created_at, дней (когда ключи неизвестны). */
    lookbackDays?: number;
    /** Момент отсчёта окна (по умолчанию — сейчас). */
    now?: Date;
}

export interface AiAnalyticsSnapshotUpsertResult {
    /** id новой ais-записи. */
    id: string;
    /** id записей того же ключа, помеченных superseded. */
    supersededIds: string[];
}

export interface AiAnalyticsSnapshotPruneResult {
    /** id записей, выведенных из актуальных по ретенции. */
    retiredIds: string[];
    /** Сколько записей осталось актуальными. */
    kept: number;
}

/**
 * Хранилище снапшотов AI-аналитики в таблице ais (план 5.1–5.2): новых
 * таблиц нет, ключ — domain + type + activity_id (+ менеджер), актуальна
 * последняя запись, прошлые — status 'superseded'. Всё через AiService
 * библиотеки call-lib, прямых обращений к Prisma нет.
 *
 * prune не удаляет строки физически (в AiRepository нет delete): он
 * выводит просроченные записи из актуальных тем же статусом; физическая
 * чистка — админ-джоба Фазы 3 после появления AiRepository.delete.
 *
 * ⚠ Стор работает только с типами Фазы 2 (manager-week, manager-month,
 * portal-model, forecast, brief, etl-run, style), записи которых лежат в
 * конверте SnapshotEnvelope. Типы feedback, audit и settings из того же
 * реестра писались раньше своими сторами в собственной форме (у feedback
 * нет activity_id), поэтому здесь они вернут пустой список, а не строки —
 * читать их надо AiAnalyticsFeedbackStore / AiAnalyticsSettingsStore и
 * AiAnalyticsAuditSnapshotStore.
 *
 * ⚠ Выборка без ключей периодов ограничена окном created_at
 * AI_ANALYTICS_SNAPSHOT_LOOKBACK_DAYS (400 дней), поэтому prune по
 * ретенции в записях (manager-week 104 недели ≈ 2 года) видит не всю
 * историю и скорее недочистит, чем лишнее: полная чистка — джоба Фазы 3.
 */
@Injectable()
export class AiAnalyticsSnapshotStore {
    constructor(private readonly aiService: AiService) {}

    /**
     * Пишет новую версию снапшота; прошлые актуальные записи того же
     * ключа помечает superseded.
     */
    async upsert<T>(
        envelope: SnapshotEnvelope<T>,
    ): Promise<AiAnalyticsSnapshotUpsertResult> {
        const previous = await this.findByKeys(envelope.domain, envelope.type, {
            periodKeys: [envelope.periodKey],
            managerIds: [envelope.managerId],
        });
        const supersededIds: string[] = [];
        for (const record of previous) {
            await this.markSuperseded(record.id);
            supersededIds.push(record.id);
        }
        const {
            user_id: userId,
            user_result: userResult,
            ...columns
        } = toAisRecord(envelope);
        const created = await this.aiService.create({
            ...columns,
            user_result: JSON.parse(
                JSON.stringify(userResult),
            ) as Prisma.JsonValue,
            ...(userId === null ? {} : { user_id: userId }),
        });
        return { id: created.id, supersededIds };
    }

    /**
     * Снапшоты домена и типа по ключам периодов и менеджерам. Без
     * periodKeys выборка идёт окном created_at (индекса по ключу нет).
     */
    async findByKeys(
        domain: string,
        type: AiAnalyticsSnapshotType,
        filter: AiAnalyticsSnapshotFilter = {},
    ): Promise<AiAnalyticsSnapshotRecord[]> {
        const rows = filter.periodKeys?.length
            ? await this.aiService.findByDomainTypeKeys(domain, type, {
                  activityIds: [...filter.periodKeys],
              })
            : await this.findInWindow(domain, type, filter);
        return sortByAge(
            rows
                .flatMap(row => this.toRecord(row))
                .filter(record => matchesFilter(record, filter)),
        );
    }

    /**
     * Последний актуальный снапшот типа: по менеджеру, если он передан
     * (null — портальные записи), иначе по всем.
     */
    async latest(
        domain: string,
        type: AiAnalyticsSnapshotType,
        managerId?: string | null,
        options: Pick<AiAnalyticsSnapshotFilter, 'lookbackDays' | 'now'> = {},
    ): Promise<AiAnalyticsSnapshotRecord | null> {
        const records = await this.findByKeys(domain, type, {
            ...options,
            ...(managerId === undefined ? {} : { managerIds: [managerId] }),
        });
        return records[records.length - 1] ?? null;
    }

    /**
     * Ретенция типа: оставляет keep последних записей на менеджера
     * (ретенция в записях) либо записи не старше N дней (ретенция в днях);
     * остальные — superseded. Ретенция 'forever' ничего не трогает.
     */
    async prune(
        domain: string,
        type: AiAnalyticsSnapshotType,
        keep?: number,
        options: Pick<AiAnalyticsSnapshotFilter, 'lookbackDays' | 'now'> = {},
    ): Promise<AiAnalyticsSnapshotPruneResult> {
        const retention = snapshotRetention(type);
        const records = await this.findByKeys(domain, type, options);
        const keepRecords = keep ?? retention.value ?? 0;
        const expired =
            keep === undefined && retention.unit === 'days'
                ? expiredByDays(records, retention.value, options.now)
                : keep === undefined && retention.unit === 'forever'
                  ? []
                  : expiredByCount(records, keepRecords);
        for (const record of expired) await this.markSuperseded(record.id);
        return {
            retiredIds: expired.map(record => record.id),
            kept: records.length - expired.length,
        };
    }

    /** Помечает запись замещённой (актуальной остаётся последняя). */
    private async markSuperseded(id: string): Promise<void> {
        await this.aiService.update(id, {
            status: AI_ANALYTICS_SNAPSHOT_STATUS.superseded,
        });
    }

    /** Выборка типа окном created_at (когда ключи периодов неизвестны). */
    private async findInWindow(
        domain: string,
        type: AiAnalyticsSnapshotType,
        filter: AiAnalyticsSnapshotFilter,
    ): Promise<AiEntityDto[]> {
        const now = filter.now ?? new Date();
        const lookbackDays =
            filter.lookbackDays ?? AI_ANALYTICS_SNAPSHOT_LOOKBACK_DAYS;
        return this.aiService.findByDomainTypesInPeriod(
            domain,
            [type],
            new Date(now.getTime() - lookbackDays * DAY_MS),
            new Date(now.getTime() + DAY_MS),
        );
    }

    /** Запись ais → снапшот; нераспознанная форма отбрасывается. */
    private toRecord(row: AiEntityDto): AiAnalyticsSnapshotRecord[] {
        const envelope = fromAisRecord(row);
        const status = parseSnapshotStatus(row.status);
        if (!envelope || status === null) return [];
        return [{ id: row.id, createdAt: row.createdAt, status, ...envelope }];
    }
}

/** По возрастанию возраста записи: created_at, при равенстве — id. */
function sortByAge(
    records: AiAnalyticsSnapshotRecord[],
): AiAnalyticsSnapshotRecord[] {
    return [...records].sort(
        (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            Number(a.id) - Number(b.id),
    );
}

function matchesFilter(
    record: AiAnalyticsSnapshotRecord,
    filter: AiAnalyticsSnapshotFilter,
): boolean {
    if (
        !filter.includeSuperseded &&
        record.status === AI_ANALYTICS_SNAPSHOT_STATUS.superseded
    ) {
        return false;
    }
    if (!filter.managerIds?.length) return true;
    return filter.managerIds.includes(record.managerId);
}

/** Все записи, кроме keep последних на менеджера (keep ≤ 0 — все). */
function expiredByCount(
    records: readonly AiAnalyticsSnapshotRecord[],
    keep: number,
): AiAnalyticsSnapshotRecord[] {
    const byManager = new Map<string, AiAnalyticsSnapshotRecord[]>();
    for (const record of records) {
        const key = record.managerId ?? '';
        byManager.set(key, [...(byManager.get(key) ?? []), record]);
    }
    return [...byManager.values()].flatMap(group =>
        keep > 0 ? group.slice(0, Math.max(group.length - keep, 0)) : group,
    );
}

/** Записи старше retention дней от now. */
function expiredByDays(
    records: readonly AiAnalyticsSnapshotRecord[],
    days: number | null,
    now: Date = new Date(),
): AiAnalyticsSnapshotRecord[] {
    if (days === null) return [];
    const edge = now.getTime() - days * DAY_MS;
    return records.filter(record => record.createdAt.getTime() < edge);
}
