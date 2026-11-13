import type { PrismaService } from '@lib/core/prisma';
import {
    TranscriptionAdminPageService,
    toTranscriptionListItem,
    transcriptionAdminPageWhere,
} from '../services/transcription-admin-page.service';

const dbRow = (id: number) => ({
    id: BigInt(id),
    created_at: new Date('2026-11-12T09:41:00Z'),
    call_started_at: null,
    domain: 'april-garant.bitrix24.ru',
    provider: 'yandex',
    status: 'done',
    duration: '734',
    symbols_count: '',
    user_id: '447',
    user_name: 'Иванова',
    entity_type: 'deal',
    entity_id: '217301',
    entity_name: 'Ромашка',
    app: 'event-sales',
    department: null,
});

describe('TranscriptionAdminPageService — список транскрипций админки', () => {
    it('фильтр только из заданных полей; поиск — по сотруднику, сущности, id', () => {
        expect(transcriptionAdminPageWhere({})).toEqual({});
        expect(
            transcriptionAdminPageWhere({
                domain: 'a.bitrix24.ru',
                provider: 'yandex',
                status: 'done',
                app: 'event-sales',
                userId: '447',
                search: '  Ромашка ',
                dateFrom: '2026-11-01',
                dateTo: '2026-11-30',
            }),
        ).toEqual({
            domain: 'a.bitrix24.ru',
            provider: 'yandex',
            status: 'done',
            app: 'event-sales',
            user_id: '447',
            created_at: {
                gte: new Date('2026-10-31T21:00:00.000Z'),
                lt: new Date('2026-11-30T21:00:00.000Z'),
            },
            OR: [
                { user_name: { contains: 'Ромашка' } },
                { entity_name: { contains: 'Ромашка' } },
                { entity_id: 'Ромашка' },
                { activity_id: 'Ромашка' },
            ],
        });
        // Пустой поиск условия не добавляет.
        expect(transcriptionAdminPageWhere({ search: '   ' })).toEqual({});
    });

    it('строка списка: числа из строк, пустое — null, текста нет', () => {
        const item = toTranscriptionListItem(dbRow(5));
        expect(item).toMatchObject({
            id: '5',
            durationSec: 734,
            symbolsCount: null,
            provider: 'yandex',
        });
        expect(item).not.toHaveProperty('text');
    });

    it('страница: без текста в выборке, свежие первыми, пропуск по странице, общее число — тем же фильтром', async () => {
        const findMany = jest.fn().mockResolvedValue([dbRow(30), dbRow(29)]);
        const count = jest.fn().mockResolvedValue(132);
        const prisma = {
            transcription: { findMany, count },
        } as unknown as PrismaService;

        const page = await new TranscriptionAdminPageService(prisma).findPage({
            page: 3,
            pageSize: 20,
            domain: 'a.bitrix24.ru',
        });

        const args = findMany.mock.calls[0] as [Record<string, unknown>];
        expect(args[0]).toMatchObject({
            where: { domain: 'a.bitrix24.ru' },
            orderBy: { id: 'desc' },
            skip: 40,
            take: 20,
        });
        expect(args[0].select).not.toHaveProperty('text');
        expect(args[0].select).not.toHaveProperty('segments');
        expect(count).toHaveBeenCalledWith({
            where: { domain: 'a.bitrix24.ru' },
        });
        expect(page).toMatchObject({ total: 132, page: 3, pageSize: 20 });
        expect(page.items.map(item => item.id)).toEqual(['30', '29']);
    });

    it('значения фильтров: по порталу, без пустых, частые первыми', async () => {
        const groupBy = jest.fn((args: { by: string[] }) => {
            const field = args.by[0];
            return Promise.resolve([
                { [field]: `${field}-1`, _count: { _all: 2 } },
                { [field]: null, _count: { _all: 9 } },
                { [field]: `${field}-2`, _count: { _all: 5 } },
            ]);
        });
        const prisma = {
            transcription: { groupBy },
        } as unknown as PrismaService;

        const facets = await new TranscriptionAdminPageService(prisma).facets(
            'a.bitrix24.ru',
        );

        expect(groupBy).toHaveBeenCalledWith({
            by: ['provider'],
            where: { domain: 'a.bitrix24.ru' },
            _count: { _all: true },
        });
        expect(facets.providers).toEqual([
            { value: 'provider-2', count: 5 },
            { value: 'provider-1', count: 2 },
        ]);
        expect(facets.domains.map(item => item.value)).toEqual([
            'domain-2',
            'domain-1',
        ]);
    });
});
