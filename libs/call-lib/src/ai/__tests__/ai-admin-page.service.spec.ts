import type { PrismaService } from '@lib/core/prisma';
import { AI_ADMIN_PAGE } from '../dto/ai-admin-page.dto';
import {
    AiAdminPageService,
    aiAdminPageBounds,
    aiAdminPageWhere,
} from '../services/ai-admin-page.service';

const row = (id: number) => ({
    id: BigInt(id),
    created_at: new Date('2026-11-05T10:00:00Z'),
    updated_at: new Date('2026-11-05T10:00:00Z'),
    domain: 'april-garant.bitrix24.ru',
    type: 'agent-analysis',
});

function prismaWith(rows: ReturnType<typeof row>[], total: number) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const count = jest.fn().mockResolvedValue(total);
    const prisma = { ai: { findMany, count } } as unknown as PrismaService;
    return { prisma, findMany, count };
}

describe('AiAdminPageService — страница AI-записей админки', () => {
    it('фильтр только из заданных полей; страница и размер с пределами', () => {
        expect(aiAdminPageWhere({})).toEqual({});
        expect(
            aiAdminPageWhere({
                domain: 'a.bitrix24.ru',
                type: 'agent-analysis',
            }),
        ).toEqual({ domain: 'a.bitrix24.ru', type: 'agent-analysis' });
        expect(aiAdminPageBounds({})).toEqual({
            page: 1,
            pageSize: AI_ADMIN_PAGE.defaultPageSize,
        });
        expect(aiAdminPageBounds({ page: 0, pageSize: 10_000 })).toEqual({
            page: 1,
            pageSize: AI_ADMIN_PAGE.maxPageSize,
        });
    });

    it('свежие первыми, пропуск по странице, общее число — тем же фильтром', async () => {
        const { prisma, findMany, count } = prismaWith([row(30), row(29)], 132);
        const page = await new AiAdminPageService(prisma).findPage({
            page: 3,
            pageSize: 20,
            domain: 'april-garant.bitrix24.ru',
        });

        expect(findMany).toHaveBeenCalledWith({
            where: { domain: 'april-garant.bitrix24.ru' },
            orderBy: { id: 'desc' },
            skip: 40,
            take: 20,
        });
        expect(count).toHaveBeenCalledWith({
            where: { domain: 'april-garant.bitrix24.ru' },
        });
        expect(page.total).toBe(132);
        expect(page.page).toBe(3);
        expect(page.pageSize).toBe(20);
        expect(page.items.map(item => item.id)).toEqual(['30', '29']);
    });
});
