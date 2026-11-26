import { Logger } from '@nestjs/common';
import { BxDocumentDeal } from 'generated/prisma';
import { BxDepartmentStructureService } from '@lib/bx-department';
import { InnerDealRepository } from '../repositories/inner-deal.repository';
import { InnerDealLibraryService } from '../services/inner-deal-library.service';

/**
 * Список библиотеки: у каждой карточки есть краткий состав (summary) из
 * слепка в колонке rows. Разбор идёт в памяти, лишних запросов нет.
 */
describe('InnerDealLibraryService.list: summary заготовки', () => {
    const snapshotV2 = JSON.stringify({
        schemaVersion: 2,
        contractCode: 'internet',
        supplyCode: 'internet_1',
        general: {
            id: 'general',
            kind: 'general',
            collapsed: false,
            rows: [
                {
                    role: 'main',
                    productType: 'garant',
                    refs: {
                        supplyCode: 'internet_1',
                        contractCode: 'internet',
                    },
                    names: { name: 'Гарант-Юрист', shortName: 'Юрист' },
                    price: { sum: 8008 },
                },
            ],
        },
        alternative: [],
    });

    const snapshotV1 = JSON.stringify({
        show: 'rows',
        sets: {
            general: [
                {
                    id: 0,
                    rows: {
                        garant: [
                            {
                                id: 0,
                                productType: 'garant',
                                name: 'Гарант-Эксперт PRO',
                                contract: { name: 'Internet', number: 0 },
                                supply: { name: 'Интернет 1 ОД', number: 1 },
                                price: { sum: 8008 },
                            },
                        ],
                    },
                },
            ],
            alternative: [],
        },
    });

    const row = (id: number, rows: string | null): BxDocumentDeal =>
        ({
            id: BigInt(id),
            kind: 'favorite',
            isFavorite: true,
            visibility: 'portal',
            portalId: 5n,
            creatorBxUserId: 10,
            userId: 10,
            department: null,
            isArchived: false,
            title: null,
            dealName: '{"value":""}',
            created_at: new Date('2026-11-01T10:00:00.000Z'),
            updated_at: null,
            rows,
        }) as unknown as BxDocumentDeal;

    const makeService = (rows: BxDocumentDeal[]) => {
        const repository = {
            findPortalIdByDomain: jest.fn().mockResolvedValue(5n),
            listLibrary: jest.fn().mockResolvedValue(rows),
        };
        // структуры отделов нет: пользователь — обычный сотрудник
        const structure = {
            getStructure: jest.fn().mockRejectedValue(new Error('нет ОП')),
        };
        const service = new InnerDealLibraryService(
            repository as unknown as InnerDealRepository,
            structure as unknown as BxDepartmentStructureService,
        );
        return { service, repository };
    };

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('слепки v2 и v1 дают summary, битый и пустой слепок — null', async () => {
        const { service } = makeService([
            row(4, snapshotV2),
            row(3, snapshotV1),
            row(2, '{"битый'),
            row(1, null),
        ]);

        const items = await service.list('gsr.bitrix24.ru', 447);

        expect(items.map(item => item.id)).toEqual([4, 3, 2, 1]);
        expect(items[0].summary).toEqual({
            complect: 'Гарант-Юрист',
            supply: 'Интернет 1 ОД',
            contract: 'Интернет',
            sum: 8008,
            rowsCount: 1,
        });
        expect(items[1].summary).toEqual({
            complect: 'Гарант-Эксперт PRO',
            supply: 'Интернет 1 ОД',
            contract: 'Интернет',
            sum: 8008,
            rowsCount: 1,
        });
        expect(items[2].summary).toBeNull();
        expect(items[3].summary).toBeNull();
    });

    it('остальные поля карточки на месте, имя сделки из легаси-объекта пустое', async () => {
        const { service } = makeService([row(7, snapshotV2)]);

        const [item] = await service.list('gsr.bitrix24.ru', 447);

        expect(item).toMatchObject({
            id: 7,
            kind: 'favorite',
            visibility: 'portal',
            title: null,
            dealName: null,
            authorId: 10,
            isArchived: false,
            createdAt: '2026-11-01T10:00:00.000Z',
        });
    });

    it('справочники и БД на строку не трогаются: один поиск портала и одна выборка', async () => {
        const rows = Array.from({ length: 300 }, (_, index) =>
            row(index + 1, snapshotV2),
        );
        const { service, repository } = makeService(rows);

        const items = await service.list('gsr.bitrix24.ru', 447);

        expect(items).toHaveLength(300);
        expect(
            items.every(item => item.summary?.complect === 'Гарант-Юрист'),
        ).toBe(true);
        expect(repository.findPortalIdByDomain).toHaveBeenCalledTimes(1);
        expect(repository.listLibrary).toHaveBeenCalledTimes(1);
    });
});
