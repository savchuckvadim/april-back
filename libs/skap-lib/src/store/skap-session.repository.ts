import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@lib/core';
import { SkapSession } from 'generated/prisma';
import { SkapSessionInput } from './skap-store.types';

/**
 * Сессии из Online_detail (skap_sessions): полный съём «вся инфа что
 * есть» bulk-вставками; дубликаты отсекает unique dedup_key.
 */
@Injectable()
export class SkapSessionRepository {
    constructor(private readonly prisma: PrismaService) {}

    /** Bulk-вставка, дубликаты молча пропускаются (skipDuplicates). */
    async createManySkipDuplicates(rows: SkapSessionInput[]): Promise<number> {
        if (!rows.length) return 0;
        const { count } = await this.prisma.skapSession.createMany({
            data: rows.map(row => ({
                id: randomUUID(),
                portal_id: row.portalId,
                domain: row.domain,
                dedupKey: row.dedupKey,
                itemId: row.itemId ?? null,
                clientCard: row.clientCard,
                regList: row.regList,
                login: row.login,
                complectArmId: row.complectArmId ?? null,
                complectType: row.complectType ?? null,
                startedAt: row.startedAt,
                endedAt: row.endedAt ?? null,
                durationSec: row.durationSec,
                ip: row.ip ?? null,
            })),
            skipDuplicates: true,
        });
        return count;
    }

    /** Сессии записи логин×месяц (для таймлайна/отчётов). */
    async listByItem(itemId: string): Promise<SkapSession[]> {
        return this.prisma.skapSession.findMany({
            where: { itemId },
            orderBy: { startedAt: 'asc' },
        });
    }
}
