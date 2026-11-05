import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lib/core/prisma';
import {
    AI_ADMIN_PAGE,
    AiAdminPageDto,
    AiAdminPageQueryDto,
} from '../dto/ai-admin-page.dto';
import { AiEntityDto } from '../dto/ai-entity.dto';
import { createAiEntityFromPrisma } from '../lib/ai-entity.util';

/** Условие выборки страницы: только заданные фильтры. */
export function aiAdminPageWhere(query: AiAdminPageQueryDto): {
    domain?: string;
    type?: string;
} {
    return {
        ...(query.domain ? { domain: query.domain } : {}),
        ...(query.type ? { type: query.type } : {}),
    };
}

/** Номер и размер страницы с дефолтами и пределами. */
export function aiAdminPageBounds(query: AiAdminPageQueryDto): {
    page: number;
    pageSize: number;
} {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(
        AI_ADMIN_PAGE.maxPageSize,
        Math.max(
            1,
            Math.floor(query.pageSize ?? AI_ADMIN_PAGE.defaultPageSize),
        ),
    );
    return { page, pageSize };
}

/**
 * Страница AI-записей для админки (`GET admin/ai/page`): свежие первыми,
 * общее число под фильтром. Прежний `GET admin/ai` отдавал все записи
 * разом и вешал вкладку браузера (05.11.2026) — список админки ходит сюда.
 * Только чтение; объявлен в админском модуле, в event-sales не попадает.
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
                row => new AiEntityDto(createAiEntityFromPrisma(row)),
            ),
            total,
            page,
            pageSize,
        };
    }
}
