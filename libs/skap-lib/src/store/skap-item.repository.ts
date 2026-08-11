import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@lib/core';
import { SkapImportItem } from 'generated/prisma';
import {
    SKAP_ITEM_BUSY_STATUSES,
    SkapItemStatus,
    SkapItemUpsertInput,
} from './skap-store.types';

/**
 * Записи логин×месяц (skap_import_items): идемпотентность по dedup_key,
 * upsert и выборки для вычисления событий месяца и админки.
 */
@Injectable()
export class SkapItemRepository {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Батч-проверка «уже записано» одним SELECT (паттерн
     * filterBusyDedupKeys из call-report): занят только created/updated —
     * error и skipped_* ретраятся следующим прогоном.
     */
    async filterBusyDedupKeys(dedupKeys: string[]): Promise<Set<string>> {
        if (!dedupKeys.length) return new Set();
        const rows = await this.prisma.skapImportItem.findMany({
            where: {
                dedupKey: { in: dedupKeys },
                status: { in: [...SKAP_ITEM_BUSY_STATUSES] },
            },
            select: { dedupKey: true },
        });
        return new Set(rows.map(row => row.dedupKey));
    }

    /** Upsert по dedup_key (update не затирает связи, если не переданы). */
    async upsertByDedupKey(
        input: SkapItemUpsertInput,
    ): Promise<SkapImportItem> {
        const update = {
            status: input.status,
            warning: input.warning ?? null,
            fileId: input.fileId ?? undefined,
            bitrixItemId: input.bitrixItemId ?? undefined,
            companyId: input.companyId ?? undefined,
            dealId: input.dealId ?? undefined,
            contactId: input.contactId ?? undefined,
            sessionCount: input.sessionCount ?? undefined,
            timeTotalMin: input.timeTotalMin ?? undefined,
            ipCount: input.ipCount ?? undefined,
        };
        return this.prisma.skapImportItem.upsert({
            where: { dedupKey: input.dedupKey },
            update,
            create: {
                id: randomUUID(),
                portal_id: input.portalId,
                domain: input.domain,
                dedupKey: input.dedupKey,
                clientCard: input.clientCard,
                regList: input.regList,
                login: input.login,
                period: input.period,
                status: input.status,
                warning: input.warning ?? null,
                fileId: input.fileId ?? null,
                bitrixItemId: input.bitrixItemId ?? null,
                companyId: input.companyId ?? null,
                dealId: input.dealId ?? null,
                contactId: input.contactId ?? null,
                sessionCount: input.sessionCount ?? null,
                timeTotalMin: input.timeTotalMin ?? null,
                ipCount: input.ipCount ?? null,
            },
        });
    }

    /**
     * Прошлые записи клиента до указанного месяца — для событий месяца
     * (first_client_month / new_login / growth / drop).
     */
    async findClientHistoryBefore(
        portalId: bigint,
        clientCard: string,
        before: Date,
    ): Promise<Pick<SkapImportItem, 'login' | 'period' | 'sessionCount'>[]> {
        return this.prisma.skapImportItem.findMany({
            where: {
                portal_id: portalId,
                clientCard,
                period: { lt: before },
            },
            select: { login: true, period: true, sessionCount: true },
        });
    }

    /** Записи по dedup-ключам (чанками): id + связка с элементом Bitrix. */
    async findByDedupKeys(
        dedupKeys: string[],
    ): Promise<
        Pick<SkapImportItem, 'id' | 'dedupKey' | 'bitrixItemId' | 'login'>[]
    > {
        if (!dedupKeys.length) return [];
        const out: Pick<
            SkapImportItem,
            'id' | 'dedupKey' | 'bitrixItemId' | 'login'
        >[] = [];
        for (let i = 0; i < dedupKeys.length; i += 500) {
            const chunk = dedupKeys.slice(i, i + 500);
            const rows = await this.prisma.skapImportItem.findMany({
                where: { dedupKey: { in: chunk } },
                select: {
                    id: true,
                    dedupKey: true,
                    bitrixItemId: true,
                    login: true,
                },
            });
            out.push(...rows);
        }
        return out;
    }

    /** Листинг для админки (свежие первыми). */
    async listByPortal(
        portalId: bigint,
        take = 200,
        status?: SkapItemStatus,
    ): Promise<SkapImportItem[]> {
        return this.prisma.skapImportItem.findMany({
            where: { portal_id: portalId, ...(status ? { status } : {}) },
            orderBy: { updatedAt: 'desc' },
            take,
        });
    }

    /** Карточки без компании — кандидаты на reprocess после заведения. */
    async countByStatus(
        portalId: bigint,
        status: SkapItemStatus,
    ): Promise<number> {
        return this.prisma.skapImportItem.count({
            where: { portal_id: portalId, status },
        });
    }

    /**
     * Файлы-источники записей в статусе (distinct) — для reprocess:
     * сброс этих файлов в pending пересоздаст пропущенные записи.
     */
    async findFileIdsByStatus(
        portalId: bigint,
        status: SkapItemStatus,
    ): Promise<string[]> {
        const rows = await this.prisma.skapImportItem.findMany({
            where: { portal_id: portalId, status, fileId: { not: null } },
            select: { fileId: true },
            distinct: ['fileId'],
        });
        return rows
            .map(row => row.fileId)
            .filter((fileId): fileId is string => Boolean(fileId));
    }
}
