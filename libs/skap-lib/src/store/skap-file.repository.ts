import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@lib/core';
import { Prisma, SkapImportFile } from 'generated/prisma';
import {
    SkapDiskFileInput,
    SkapFileStats,
    SkapFileStatus,
    SkapFileSyncResult,
} from './skap-store.types';

/**
 * Журнал файлов выгрузок СКАП (skap_import_files): синк листинга Диска,
 * очередь pending-файлов и переходы статусов обработки.
 */
@Injectable()
export class SkapFileRepository {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Синк листинга Диска с журналом: новые файлы → pending; перезалитые
     * (изменился UPDATE_TIME или size) → сброс в pending. Уже известные и
     * не изменившиеся не трогаются (их статус — источник дедупа файлов).
     */
    async syncDiskFiles(
        portalId: bigint,
        domain: string,
        diskFiles: SkapDiskFileInput[],
    ): Promise<SkapFileSyncResult> {
        const result: SkapFileSyncResult = { added: 0, reset: 0, unchanged: 0 };
        if (!diskFiles.length) return result;

        const known = await this.prisma.skapImportFile.findMany({
            where: {
                portal_id: portalId,
                diskFileId: { in: diskFiles.map(file => file.diskFileId) },
            },
        });
        const knownById = new Map(known.map(row => [row.diskFileId, row]));

        for (const file of diskFiles) {
            const existing = knownById.get(file.diskFileId);
            if (!existing) {
                await this.prisma.skapImportFile.create({
                    data: {
                        id: randomUUID(),
                        portal_id: portalId,
                        domain,
                        diskFileId: file.diskFileId,
                        fileName: file.fileName,
                        diskUpdatedAt: file.diskUpdatedAt,
                        size: file.size,
                        status: 'pending',
                    },
                });
                result.added += 1;
                continue;
            }
            const changed =
                (file.diskUpdatedAt?.getTime() ?? null) !==
                    (existing.diskUpdatedAt?.getTime() ?? null) ||
                (file.size ?? null) !== (existing.size ?? null);
            if (changed) {
                await this.prisma.skapImportFile.update({
                    where: { id: existing.id },
                    data: {
                        fileName: file.fileName,
                        diskUpdatedAt: file.diskUpdatedAt,
                        size: file.size,
                        status: 'pending',
                        error: null,
                    },
                });
                result.reset += 1;
            } else {
                result.unchanged += 1;
            }
        }
        return result;
    }

    /** Очередь на обработку: pending-файлы портала (старые первыми). */
    async findPending(
        portalId: bigint,
        limit: number,
    ): Promise<SkapImportFile[]> {
        return this.prisma.skapImportFile.findMany({
            where: { portal_id: portalId, status: 'pending' },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });
    }

    async countPending(portalId: bigint): Promise<number> {
        return this.prisma.skapImportFile.count({
            where: { portal_id: portalId, status: 'pending' },
        });
    }

    async markProcessing(id: string): Promise<void> {
        await this.prisma.skapImportFile.update({
            where: { id },
            data: { status: 'processing', startedAt: new Date(), error: null },
        });
    }

    async markDone(
        id: string,
        formatVersion: string | null,
        stats: SkapFileStats,
    ): Promise<void> {
        await this.prisma.skapImportFile.update({
            where: { id },
            data: {
                status: 'done',
                formatVersion,
                stats: stats as unknown as Prisma.InputJsonValue,
                finishedAt: new Date(),
            },
        });
    }

    async markError(
        id: string,
        status: Extract<SkapFileStatus, 'error' | 'error_format' | 'skipped'>,
        error: string,
        stats?: SkapFileStats,
    ): Promise<void> {
        await this.prisma.skapImportFile.update({
            where: { id },
            data: {
                status,
                error,
                stats: stats
                    ? (stats as unknown as Prisma.InputJsonValue)
                    : undefined,
                finishedAt: new Date(),
            },
        });
    }

    /**
     * Реанимация зависших: processing старше staleMinutes → error (иначе
     * упавший воркер навсегда спрячет файл от обработки).
     */
    async reanimateStale(staleMinutes: number): Promise<number> {
        const threshold = new Date(Date.now() - staleMinutes * 60_000);
        const { count } = await this.prisma.skapImportFile.updateMany({
            where: { status: 'processing', startedAt: { lt: threshold } },
            data: {
                status: 'error',
                error: `Реанимация: processing дольше ${staleMinutes} мин (воркер умер?)`,
            },
        });
        return count;
    }

    /** Ручной перезапуск файла из админки. */
    async resetToPending(id: string): Promise<SkapImportFile | null> {
        return this.prisma.skapImportFile
            .update({
                where: { id },
                data: { status: 'pending', error: null },
            })
            .catch(() => null);
    }

    /** Листинг для админки (свежие первыми). */
    async listByPortal(
        portalId: bigint,
        take = 100,
        status?: SkapFileStatus,
    ): Promise<SkapImportFile[]> {
        return this.prisma.skapImportFile.findMany({
            where: { portal_id: portalId, ...(status ? { status } : {}) },
            orderBy: { createdAt: 'desc' },
            take,
        });
    }

    async findById(id: string): Promise<SkapImportFile | null> {
        return this.prisma.skapImportFile.findUnique({ where: { id } });
    }
}
