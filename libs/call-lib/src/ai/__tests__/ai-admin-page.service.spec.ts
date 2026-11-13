import type { PrismaService } from '@lib/core/prisma';
import { AI_ADMIN_PAGE } from '../dto/ai-admin-page.dto';
import {
    AI_LIST_TEXT_PREVIEW,
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
    result: 'р'.repeat(1000),
    user_result: { big: true },
    in_comment: false,
    in_report: false,
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

    it('новые фильтры: поставщик, статус, сотрудник, тип сущности, поиск', () => {
        expect(
            aiAdminPageWhere({
                provider: 'vibecode',
                status: 'done',
                userId: '447',
                entityType: 'deal',
                search: ' Ромашка ',
            }),
        ).toEqual({
            provider: 'vibecode',
            status: 'done',
            user_id: 447,
            entity_type: 'deal',
            OR: [
                { user_name: { contains: 'Ромашка' } },
                { entity_name: { contains: 'Ромашка' } },
                { activity_id: 'Ромашка' },
            ],
        });
        // Числовой поиск ищет и по id сущности; кривой id сотрудника — ничего.
        expect(aiAdminPageWhere({ search: '217301', userId: 'x' })).toEqual({
            user_id: -1,
            OR: [
                { user_name: { contains: '217301' } },
                { entity_name: { contains: '217301' } },
                { entity_id: 217301 },
                { activity_id: '217301' },
            ],
        });
    });

    it('строка списка лёгкая: результат укорочен, user_result не отдаётся', async () => {
        const { prisma } = prismaWith([row(1)], 1);
        const page = await new AiAdminPageService(prisma).findPage({});
        expect(page.items[0].result).toHaveLength(AI_LIST_TEXT_PREVIEW + 1);
        expect(page.items[0].result?.endsWith('…')).toBe(true);
        expect(page.items[0].user_result).toBeNull();
    });

    it('значения фильтров: типы и поставщики, без пустых, частые первыми', async () => {
        const groupBy = jest.fn((args: { by: string[] }) => {
            const field = args.by[0];
            return Promise.resolve([
                { [field]: `${field}-1`, _count: { _all: 1 } },
                { [field]: '', _count: { _all: 7 } },
                { [field]: `${field}-2`, _count: { _all: 3 } },
            ]);
        });
        const prisma = { ai: { groupBy } } as unknown as PrismaService;
        const facets = await new AiAdminPageService(prisma).facets();
        expect(groupBy).toHaveBeenCalledWith({
            by: ['type'],
            where: {},
            _count: { _all: true },
        });
        expect(facets.types).toEqual([
            { value: 'type-2', count: 3 },
            { value: 'type-1', count: 1 },
        ]);
    });
});
