import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@lib/core';
import { Prisma, SkapImportRun } from 'generated/prisma';
import {
    capSkapWarnings,
    SkapRunStats,
    SkapRunStatus,
} from './skap-store.types';

/**
 * Журнал прогонов импорта СКАП (skap_import_runs): один run = один домен
 * за тик крона; полная история для контроля и админки.
 */
@Injectable()
export class SkapRunRepository {
    constructor(private readonly prisma: PrismaService) {}

    async start(portalId: bigint, domain: string): Promise<SkapImportRun> {
        return this.prisma.skapImportRun.create({
            data: {
                id: randomUUID(),
                portal_id: portalId,
                domain,
                status: 'running',
                startedAt: new Date(),
            },
        });
    }

    async finish(
        id: string,
        status: Exclude<SkapRunStatus, 'running'>,
        stats: SkapRunStats,
        stopReason?: string,
    ): Promise<void> {
        // Обрезка ворнингов — иначе JSON раздувает строку и ломает
        // сортировки MySQL (Out of sort memory).
        const capped = { ...stats, warnings: capSkapWarnings(stats.warnings) };
        await this.prisma.skapImportRun.update({
            where: { id },
            data: {
                status,
                stopReason: stopReason ?? null,
                stats: capped as unknown as Prisma.InputJsonValue,
                finishedAt: new Date(),
            },
        });
    }

    /**
     * Реанимация зависших прогонов: running старше бюджета →
     * stopped_time_budget (страховка на случай смерти воркера).
     */
    async reanimateStale(maxRunMinutes: number): Promise<number> {
        const threshold = new Date(Date.now() - maxRunMinutes * 60_000);
        const { count } = await this.prisma.skapImportRun.updateMany({
            where: { status: 'running', startedAt: { lt: threshold } },
            data: {
                status: 'stopped_time_budget',
                stopReason: `Реанимация: running дольше ${maxRunMinutes} мин (воркер умер?)`,
            },
        });
        return count;
    }

    /** Листинг для админки (свежие первыми). */
    async listByPortal(portalId: bigint, take = 50): Promise<SkapImportRun[]> {
        return this.prisma.skapImportRun.findMany({
            where: { portal_id: portalId },
            orderBy: { startedAt: 'desc' },
            take,
        });
    }

    /**
     * Последний прогон домена (индикатор обновления на фронте).
     *
     * Два шага сознательно: сортировка по узкому select (id) — иначе MySQL
     * тащит в filesort целые строки с большим JSON `stats` и падает с
     * «Out of sort memory» (1038, прод-инцидент 2026-08-12; индекса по
     * domain у таблицы нет — он и не нужен при узкой сортировке).
     */
    async findLatestByDomain(domain: string): Promise<SkapImportRun | null> {
        const latest = await this.prisma.skapImportRun.findFirst({
            where: { domain },
            orderBy: { startedAt: 'desc' },
            select: { id: true },
        });
        if (!latest) return null;
        return this.prisma.skapImportRun.findUnique({
            where: { id: latest.id },
        });
    }
}
