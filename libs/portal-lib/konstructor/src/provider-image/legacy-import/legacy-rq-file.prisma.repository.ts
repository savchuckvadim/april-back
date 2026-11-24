import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { LegacyRqFile, LegacyRqInfo } from './legacy-rq-file.entity';
import { LegacyRqFileRepository } from './legacy-rq-file.repository';

/** Так Laravel хранил модель реквизитов в `files.entity_type`. */
export const LEGACY_RQ_ENTITY_TYPE = 'App\\Models\\Rq';

/** Значение `files.parent` у картинок реквизитов. */
export const LEGACY_RQ_PARENT = 'rq';

const FILE_SELECT = {
    id: true,
    entity_id: true,
    parent_type: true,
    code: true,
    path: true,
} as const;

interface FileRow {
    id: bigint;
    entity_id: bigint | null;
    parent_type: string | null;
    code: string;
    path: string;
}

const toLegacyFile = (row: FileRow): LegacyRqFile[] =>
    row.entity_id === null
        ? []
        : [
              {
                  id: Number(row.id),
                  rqId: Number(row.entity_id),
                  parentType: row.parent_type,
                  code: row.code,
                  path: row.path,
              },
          ];

const clean = (value: string | null): string | null => {
    const text = value?.trim();
    return text ? text : null;
};

/** Чтение легаси-таблицы `files` и связей rq → agent → portal через Prisma. */
@Injectable()
export class LegacyRqFilePrismaRepository implements LegacyRqFileRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findByPaths(paths: readonly string[]): Promise<LegacyRqFile[]> {
        if (paths.length === 0) return [];
        const rows = await this.prisma.files.findMany({
            where: {
                entity_type: LEGACY_RQ_ENTITY_TYPE,
                parent: LEGACY_RQ_PARENT,
                path: { in: [...paths] },
            },
            select: FILE_SELECT,
            orderBy: { id: 'asc' },
        });
        return rows.flatMap(toLegacyFile);
    }

    async findByPathSuffixes(
        suffixes: readonly string[],
    ): Promise<LegacyRqFile[]> {
        if (suffixes.length === 0) return [];
        const rows = await this.prisma.files.findMany({
            where: {
                entity_type: LEGACY_RQ_ENTITY_TYPE,
                parent: LEGACY_RQ_PARENT,
                OR: suffixes.map(suffix => ({
                    path: { endsWith: `/${suffix}` },
                })),
            },
            select: FILE_SELECT,
            orderBy: { id: 'asc' },
        });
        return rows.flatMap(toLegacyFile);
    }

    async findByRqIds(rqIds: readonly number[]): Promise<LegacyRqFile[]> {
        if (rqIds.length === 0) return [];
        const rows = await this.prisma.files.findMany({
            where: {
                entity_type: LEGACY_RQ_ENTITY_TYPE,
                parent: LEGACY_RQ_PARENT,
                entity_id: { in: rqIds.map(id => BigInt(id)) },
            },
            select: FILE_SELECT,
            orderBy: { id: 'asc' },
        });
        return rows.flatMap(toLegacyFile);
    }

    async findRqInfo(rqIds: readonly number[]): Promise<LegacyRqInfo[]> {
        if (rqIds.length === 0) return [];
        const ids = rqIds.map(id => BigInt(id));
        const rqs = await this.prisma.rqs.findMany({
            where: { id: { in: ids } },
            select: {
                id: true,
                name: true,
                shortname: true,
                fullname: true,
                agentId: true,
            },
        });
        // поставщик связан с реквизитами с двух сторон: rqs.agentId и agents.rqId
        const agentIds = rqs.flatMap(rq => (rq.agentId ? [rq.agentId] : []));
        const agents = await this.prisma.agents.findMany({
            where: { OR: [{ id: { in: agentIds } }, { rqId: { in: ids } }] },
            select: { id: true, rqId: true, portalId: true },
        });
        const portals = await this.prisma.portal.findMany({
            where: { id: { in: agents.map(agent => agent.portalId) } },
            select: { id: true, domain: true },
        });
        const domainByPortal = new Map(
            portals.map(portal => [portal.id, clean(portal.domain)]),
        );
        return rqs.map(rq => {
            const agent =
                agents.find(item => item.id === rq.agentId) ??
                agents.find(item => item.rqId === rq.id);
            return {
                rqId: Number(rq.id),
                rqName:
                    clean(rq.name) ?? clean(rq.shortname) ?? clean(rq.fullname),
                portalDomain: agent
                    ? (domainByPortal.get(agent.portalId) ?? null)
                    : null,
            };
        });
    }
}
