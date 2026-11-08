import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lib/core/prisma';
import {
    Prisma,
    type SupportDialog as SupportDialogRecord,
} from 'generated/prisma';
import type {
    SupportDialogHistoryPlan,
    SupportDialogHistoryRow,
} from '../domain/support-dialog-history';

/** Код ошибки Prisma «таблицы нет» — миграция online ещё не применена. */
const TABLE_MISSING_CODE = 'P2021';

export const isSupportHistoryTableMissing = (error: unknown): boolean =>
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === TABLE_MISSING_CODE;

const toRow = (record: SupportDialogRecord): SupportDialogHistoryRow => ({
    id: record.id,
    lineDomain: record.lineDomain,
    sessionId: Number(record.sessionId),
    chatId: Number(record.chatId),
    lineId: record.lineId,
    clientPortal: record.clientPortal,
    clientName: record.clientName,
    operatorName: record.operatorName,
    maxWaitedMinutes: record.maxWaitedMinutes,
    firstSeenAt: record.firstSeenAt,
    lastSeenAt: record.lastSeenAt,
    answeredAt: record.answeredAt,
    closedAt: record.closedAt,
});

/**
 * Prisma над `support_dialogs`. Ошибки не глотает: страховку (таблицы ещё
 * нет, БД недоступна) решает сервис истории.
 */
@Injectable()
export class SupportDialogHistoryRepository {
    constructor(private readonly prisma: PrismaService) {}

    /** Строки линии, нужные для сверки такта: открытые и видимые сейчас. */
    async findKnown(
        lineDomain: string,
        sessionIds: readonly number[],
    ): Promise<SupportDialogHistoryRow[]> {
        const records = await this.prisma.supportDialog.findMany({
            where: {
                lineDomain,
                OR: [
                    { closedAt: null },
                    { sessionId: { in: sessionIds.map(id => BigInt(id)) } },
                ],
            },
        });
        return records.map(toRow);
    }

    async apply(
        lineDomain: string,
        plan: SupportDialogHistoryPlan,
        now: Date,
    ): Promise<void> {
        const writes: Prisma.PrismaPromise<unknown>[] = [
            ...plan.creates.map(({ sessionId, chatId, ...fields }) =>
                this.prisma.supportDialog.create({
                    data: {
                        id: randomUUID(),
                        lineDomain,
                        sessionId: BigInt(sessionId),
                        chatId: BigInt(chatId),
                        ...fields,
                        createdAt: now,
                        updatedAt: now,
                    },
                }),
            ),
            ...plan.updates.map(({ id, chatId, ...fields }) =>
                this.prisma.supportDialog.update({
                    where: { id },
                    data: {
                        chatId: BigInt(chatId),
                        ...fields,
                        closedAt: null,
                        updatedAt: now,
                    },
                }),
            ),
        ];
        if (plan.closeIds.length) {
            writes.push(
                this.prisma.supportDialog.updateMany({
                    where: { id: { in: plan.closeIds } },
                    data: { closedAt: now, updatedAt: now },
                }),
            );
        }
        if (writes.length) await this.prisma.$transaction(writes);
    }

    /** Обращения портала-клиента, пришедшие не раньше `since`. */
    async findByClientPortal(
        clientPortal: string,
        since: Date,
    ): Promise<SupportDialogHistoryRow[]> {
        const records = await this.prisma.supportDialog.findMany({
            where: { clientPortal, firstSeenAt: { gte: since } },
            orderBy: { firstSeenAt: 'desc' },
        });
        return records.map(toRow);
    }

    /** С какого момента ведётся учёт (первая строка истории); null — пусто. */
    async trackedSince(): Promise<Date | null> {
        const result = await this.prisma.supportDialog.aggregate({
            _min: { firstSeenAt: true },
        });
        return result._min.firstSeenAt;
    }
}
