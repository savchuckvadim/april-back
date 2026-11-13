import { Injectable } from '@nestjs/common';
import type { Prisma } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma';
import {
    AI_ADMIN_PAGE,
    AiAdminFacetsDto,
    AiAdminPageDto,
    AiAdminPageQueryDto,
} from '../dto/ai-admin-page.dto';
import { AiEntityDto } from '../dto/ai-entity.dto';
import type { AiEntity } from '../entity/ai.entity';
import { createAiEntityFromPrisma } from '../lib/ai-entity.util';
import { adminPageBounds, facetValues } from '../../admin-list/admin-list.util';

/** Сколько знаков длинного поля показывать в строке списка. */
export const AI_LIST_TEXT_PREVIEW = 300;

/** Целое из строки фильтра; не целое — null. */
const intOf = (raw: string): number | null =>
    /^\d+$/.test(raw) ? Number(raw) : null;

/** Поиск: имя сотрудника, название и id сущности (числом), id дела. */
function searchWhere(search: string): Prisma.AiWhereInput[] {
    const id = intOf(search);
    return [
        { user_name: { contains: search } },
        { entity_name: { contains: search } },
        ...(id !== null ? [{ entity_id: id }] : []),
        { activity_id: search },
    ];
}

/**
 * Условие выборки страницы: только заданные фильтры. В `ais` id
 * сотрудника и сущности — числа: нечисловой id сотрудника не находит
 * ничего (а не снимает фильтр).
 */
export function aiAdminPageWhere(
    query: AiAdminPageQueryDto,
): Prisma.AiWhereInput {
    const search = query.search?.trim();
    return {
        ...(query.domain ? { domain: query.domain } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.provider ? { provider: query.provider } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.userId ? { user_id: intOf(query.userId) ?? -1 } : {}),
        ...(query.entityType ? { entity_type: query.entityType } : {}),
        ...(search ? { OR: searchWhere(search) } : {}),
    };
}

/** Номер и размер страницы с дефолтами и пределами. */
export function aiAdminPageBounds(query: AiAdminPageQueryDto): {
    page: number;
    pageSize: number;
} {
    return adminPageBounds(query, AI_ADMIN_PAGE);
}

const preview = (text: string | null | undefined): string | null | undefined =>
    text && text.length > AI_LIST_TEXT_PREVIEW
        ? `${text.slice(0, AI_LIST_TEXT_PREVIEW)}…`
        : text;

/**
 * Запись для строки списка: длинные тексты укорочены, user_result не
 * отдаётся. Страница из 50 разборов с полными результатами весила
 * мегабайты и вешала вкладку; целиком запись открывается по id.
 */
export function toAiListEntity(entity: AiEntity): AiEntity {
    entity.result = preview(entity.result);
    entity.report_result = preview(entity.report_result);
    entity.user_comment = preview(entity.user_comment);
    entity.owner_comment = preview(entity.owner_comment);
    entity.user_result = null;
    return entity;
}

/**
 * Страница AI-записей для админки (`GET admin/ai/page`): свежие первыми,
 * общее число под фильтром, все фильтры — на сервере; значения фильтров —
 * `GET admin/ai/facets`. Прежний `GET admin/ai` отдавал все записи разом и
 * вешал вкладку браузера (05.11.2026). Только чтение; объявлен в админском
 * модуле, в event-sales не попадает.
 */
@Injectable()
export class AiAdminPageService {
    constructor(private readonly prisma: PrismaService) {}

    async findPage(query: AiAdminPageQueryDto): Promise<AiAdminPageDto> {
        const where = aiAdminPageWhere(query);
        const { page, pageSize } = aiAdminPageBounds(query);
        const [rows, total] = await Promise.all([
            this.prisma.ai.findMany({
                where,
                orderBy: { id: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.ai.count({ where }),
        ]);
        return {
            items: rows.map(
                row =>
                    new AiEntityDto(
                        toAiListEntity(createAiEntityFromPrisma(row)),
                    ),
            ),
            total,
            page,
            pageSize,
        };
    }

    /** Значения фильтров — по всей таблице или по одному порталу. */
    async facets(domain?: string): Promise<AiAdminFacetsDto> {
        const where: Prisma.AiWhereInput = domain ? { domain } : {};
        const [domains, types, providers, statuses] = await Promise.all([
            this.prisma.ai.groupBy({
                by: ['domain'],
                where,
                _count: { _all: true },
            }),
            this.prisma.ai.groupBy({
                by: ['type'],
                where,
                _count: { _all: true },
            }),
            this.prisma.ai.groupBy({
                by: ['provider'],
                where,
                _count: { _all: true },
            }),
            this.prisma.ai.groupBy({
                by: ['status'],
                where,
                _count: { _all: true },
            }),
        ]);
        return {
            domains: facetValues(
                domains.map(g => ({ value: g.domain, count: g._count._all })),
            ),
            types: facetValues(
                types.map(g => ({ value: g.type, count: g._count._all })),
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
        };
    }
}
