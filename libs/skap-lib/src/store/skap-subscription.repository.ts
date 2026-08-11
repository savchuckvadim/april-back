import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@lib/core';
import { SkapSubscription } from 'generated/prisma';
import { SkapSubscriptionInput } from './skap-store.types';

/**
 * Подписки/комплекты из Prime_lent (skap_subscriptions): месячный снапшот
 * bulk-вставками; дубликаты отсекает unique dedup_key.
 */
@Injectable()
export class SkapSubscriptionRepository {
    constructor(private readonly prisma: PrismaService) {}

    /** Bulk-вставка, дубликаты молча пропускаются (skipDuplicates). */
    async createManySkipDuplicates(
        rows: SkapSubscriptionInput[],
    ): Promise<number> {
        if (!rows.length) return 0;
        const { count } = await this.prisma.skapSubscription.createMany({
            data: rows.map(row => ({
                id: randomUUID(),
                portal_id: row.portalId,
                domain: row.domain,
                dedupKey: row.dedupKey,
                itemId: row.itemId ?? null,
                clientCard: row.clientCard,
                regList: row.regList,
                complectArmId: row.complectArmId,
                complectName: row.complectName ?? null,
                supplyKind: row.supplyKind ?? null,
                city: row.city ?? null,
                region: row.region ?? null,
                version: row.version ?? null,
                content: row.content ?? null,
                managerName: row.managerName ?? null,
                managerEmail: row.managerEmail ?? null,
                mailingName: row.mailingName ?? null,
                mailingEmail: row.mailingEmail ?? null,
                isActive: row.isActive,
                period: row.period,
            })),
            skipDuplicates: true,
        });
        return count;
    }

    /** Снапшот клиента за месяц (обогащение элемента и отчёты). */
    async listByClientPeriod(
        portalId: bigint,
        clientCard: string,
        period: Date,
    ): Promise<SkapSubscription[]> {
        return this.prisma.skapSubscription.findMany({
            where: { portal_id: portalId, clientCard, period },
        });
    }

    /** Все подписки портала за месяц (обогащение при импорте Online). */
    async listByPeriod(
        portalId: bigint,
        period: Date,
    ): Promise<SkapSubscription[]> {
        return this.prisma.skapSubscription.findMany({
            where: { portal_id: portalId, period },
        });
    }
}
