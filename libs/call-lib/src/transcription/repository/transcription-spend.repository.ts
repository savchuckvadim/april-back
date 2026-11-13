import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma';
import {
    MOSCOW_UTC_OFFSET_HOURS,
    type SpendAggregate,
    spendNumber,
    YANDEX_MIN_BILLED_SEC,
} from '../lib/transcription-spend.util';

/** Срез выборки расхода: месяц и, если задан, один портал. */
export interface SpendSlice {
    from: Date;
    to: Date;
    domain?: string;
}

/** Агрегат с ключом группы (портал, день или сотрудник). */
export interface SpendAggregateRow extends SpendAggregate {
    key: string;
    /** Подпись группы (имя сотрудника); у портала и дня — пусто. */
    label: string | null;
}

/** Звонок, распознанный Яндексом, — для списка самых длинных. */
export interface SpendCallRow {
    id: string;
    createdAt: Date | null;
    durationSec: number;
    userName: string | null;
    entityType: string | null;
    entityId: string | null;
    entityName: string | null;
}

/** Группировка агрегата: по порталу, дню (по Москве) или сотруднику. */
export type SpendGroupBy = 'domain' | 'day' | 'user';

interface RawAggregate {
    group_key: string | null;
    group_label: string | null;
    provider: string | null;
    calls: unknown;
    known_sec: unknown;
    billed_sec: unknown;
    unknown_calls: unknown;
}

interface RawCall {
    id: unknown;
    created_at: Date | null;
    sec: unknown;
    user_name: string | null;
    entity_type: string | null;
    entity_id: string | null;
    entity_name: string | null;
}

/**
 * Длительность из VARCHAR-колонки: только если она начинается с цифр,
 * иначе NULL (пусто, мусор) — такие звонки считаются «без длительности».
 */
const SEC_SQL = Prisma.sql`CASE WHEN t.duration REGEXP '^[0-9]+' THEN CAST(t.duration AS UNSIGNED) ELSE NULL END`;

const GROUP_SQL: Readonly<
    Record<SpendGroupBy, { key: Prisma.Sql; label: Prisma.Sql }>
> = {
    domain: { key: Prisma.sql`t.domain`, label: Prisma.sql`NULL` },
    day: {
        key: Prisma.sql`DATE_FORMAT(t.created_at + INTERVAL ${Prisma.raw(String(MOSCOW_UTC_OFFSET_HOURS))} HOUR, '%Y-%m-%d')`,
        label: Prisma.sql`NULL`,
    },
    user: { key: Prisma.sql`t.user_id`, label: Prisma.sql`MAX(t.user_name)` },
};

/**
 * Чтение расхода на распознавание из `transcriptions` (только SELECT).
 * Учитываются строки, у которых записан распознаватель — то есть звонок
 * распознан; месяц — по дате создания строки.
 */
@Injectable()
export class TranscriptionSpendRepository {
    constructor(private readonly prisma: PrismaService) {}

    /** Звонки и секунды по распознавателям, сгруппированные по `groupBy`. */
    async aggregate(
        slice: SpendSlice,
        groupBy: SpendGroupBy,
    ): Promise<SpendAggregateRow[]> {
        const group = GROUP_SQL[groupBy];
        const rows = await this.prisma.$queryRaw<RawAggregate[]>`
            SELECT ${group.key} AS group_key,
                   ${group.label} AS group_label,
                   t.provider AS provider,
                   COUNT(*) AS calls,
                   SUM(${SEC_SQL}) AS known_sec,
                   SUM(GREATEST(${SEC_SQL}, ${Prisma.raw(String(YANDEX_MIN_BILLED_SEC))})) AS billed_sec,
                   SUM(CASE WHEN t.duration REGEXP '^[0-9]+' THEN 0 ELSE 1 END) AS unknown_calls
            FROM transcriptions t
            WHERE ${this.where(slice)}
            GROUP BY group_key, t.provider`;
        return rows.map(row => ({
            key: row.group_key ?? '',
            label: row.group_label,
            provider: row.provider,
            calls: spendNumber(row.calls),
            knownSec: spendNumber(row.known_sec),
            billedSec: spendNumber(row.billed_sec),
            unknownCalls: spendNumber(row.unknown_calls),
        }));
    }

    /** Самые длинные звонки портала, распознанные Яндексом. */
    async longestYandexCalls(
        slice: SpendSlice,
        limit: number,
    ): Promise<SpendCallRow[]> {
        const rows = await this.prisma.$queryRaw<RawCall[]>`
            SELECT t.id, t.created_at, ${SEC_SQL} AS sec, t.user_name,
                   t.entity_type, t.entity_id, t.entity_name
            FROM transcriptions t
            WHERE ${this.where(slice)} AND LOWER(t.provider) LIKE 'yandex%'
            ORDER BY sec DESC
            LIMIT ${Prisma.raw(String(Math.max(1, Math.trunc(limit))))}`;
        return rows.map(row => ({
            id: String(spendNumber(row.id)),
            createdAt: row.created_at,
            durationSec: spendNumber(row.sec),
            userName: row.user_name,
            entityType: row.entity_type,
            entityId: row.entity_id,
            entityName: row.entity_name,
        }));
    }

    /** Id порталов по доменам — для ссылок из сводки. */
    async portalIds(domains: readonly string[]): Promise<Map<string, number>> {
        if (domains.length === 0) return new Map();
        const portals = await this.prisma.portal.findMany({
            where: { domain: { in: [...domains] } },
            select: { id: true, domain: true },
        });
        return new Map(
            portals.flatMap(portal =>
                portal.domain ? [[portal.domain, Number(portal.id)]] : [],
            ),
        );
    }

    private where(slice: SpendSlice): Prisma.Sql {
        const domain = slice.domain
            ? Prisma.sql`AND t.domain = ${slice.domain}`
            : Prisma.empty;
        return Prisma.sql`t.provider IS NOT NULL AND t.provider <> ''
            AND t.created_at >= ${slice.from} AND t.created_at < ${slice.to}
            ${domain}`;
    }
}
