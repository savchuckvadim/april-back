import { Injectable } from '@nestjs/common';
import type { Prisma } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma';
import {
    adminPageBounds,
    facetValues,
    moscowDayRange,
    numberOrNull,
} from '../../admin-list/admin-list.util';
import {
    TRANSCRIPTION_ADMIN_PAGE,
    type TranscriptionAdminFacetsDto,
    type TranscriptionAdminListItemDto,
    type TranscriptionAdminPageDto,
    type TranscriptionAdminPageQueryDto,
} from '../dto/transcription-admin-page.dto';

/** Поля строки списка: без текста, сегментов и комментариев. */
const LIST_SELECT = {
    id: true,
    created_at: true,
    call_started_at: true,
    domain: true,
    provider: true,
    status: true,
    duration: true,
    symbols_count: true,
    user_id: true,
    user_name: true,
    entity_type: true,
    entity_id: true,
    entity_name: true,
    app: true,
    department: true,
} as const satisfies Prisma.TranscriptionSelect;

type ListRow = Prisma.TranscriptionGetPayload<{ select: typeof LIST_SELECT }>;

/** Условие выборки страницы: только заданные фильтры. */
export function transcriptionAdminPageWhere(
    query: TranscriptionAdminPageQueryDto,
): Prisma.TranscriptionWhereInput {
    const search = query.search?.trim();
    const createdAt = moscowDayRange(query.dateFrom, query.dateTo);
    return {
        ...(query.domain ? { domain: query.domain } : {}),
        ...(query.provider ? { provider: query.provider } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.app ? { app: query.app } : {}),
        ...(query.userId ? { user_id: query.userId } : {}),
        ...(createdAt ? { created_at: createdAt } : {}),
        ...(search
            ? {
                  OR: [
                      { user_name: { contains: search } },
                      { entity_name: { contains: search } },
                      { entity_id: search },
                      { activity_id: search },
                  ],
              }
            : {}),
    };
}

/** Строка базы → строка списка. */
export function toTranscriptionListItem(
    row: ListRow,
): TranscriptionAdminListItemDto {
    return {
        id: row.id.toString(),
        createdAt: row.created_at,
        callStartedAt: row.call_started_at,
        domain: row.domain,
        provider: row.provider,
        status: row.status,
        durationSec: numberOrNull(row.duration),
        symbolsCount: numberOrNull(row.symbols_count),
        userId: row.user_id,
        userName: row.user_name,
        entityType: row.entity_type,
        entityId: row.entity_id,
        entityName: row.entity_name,
        app: row.app,
        department: row.department,
    };
}

/**
 * Постраничный список транскрипций для админки (`GET
 * admin/transcription-store/page`) и значения его фильтров. Прежний
 * `GET admin/transcription-store` отдавал все записи с текстами разом —
 * вкладка браузера висла (13.11.2026). Только чтение.
 */
@Injectable()
export class TranscriptionAdminPageService {
    constructor(private readonly prisma: PrismaService) {}

    async findPage(
        query: TranscriptionAdminPageQueryDto,
    ): Promise<TranscriptionAdminPageDto> {
        const where = transcriptionAdminPageWhere(query);
        const { page, pageSize } = adminPageBounds(
            query,
            TRANSCRIPTION_ADMIN_PAGE,
        );
        const [rows, total] = await Promise.all([
            this.prisma.transcription.findMany({
                where,
                select: LIST_SELECT,
                orderBy: { id: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.transcription.count({ where }),
        ]);
        return {
            items: rows.map(toTranscriptionListItem),
            total,
            page,
            pageSize,
        };
    }

    /**
     * Значения фильтров: порталы, распознаватели, статусы, приложения — по
     * всей таблице или по одному порталу.
     */
    async facets(domain?: string): Promise<TranscriptionAdminFacetsDto> {
        const where: Prisma.TranscriptionWhereInput = domain ? { domain } : {};
        const [domains, providers, statuses, apps] = await Promise.all([
            this.prisma.transcription.groupBy({
                by: ['domain'],
                where,
                _count: { _all: true },
            }),
            this.prisma.transcription.groupBy({
                by: ['provider'],
                where,
                _count: { _all: true },
            }),
            this.prisma.transcription.groupBy({
                by: ['status'],
                where,
                _count: { _all: true },
            }),
            this.prisma.transcription.groupBy({
                by: ['app'],
                where,
                _count: { _all: true },
            }),
        ]);
        return {
            domains: facetValues(
                domains.map(g => ({ value: g.domain, count: g._count._all })),
            ),
            providers: facetValues(
                providers.map(g => ({
                    value: g.provider,
                    count: g._count._all,
                })),
            ),
            statuses: facetValues(
                statuses.map(g => ({ value: g.status, count: g._count._all })),
            ),
            apps: facetValues(
                apps.map(g => ({ value: g.app, count: g._count._all })),
            ),
        };
    }
}
