import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@lib/core/prisma';
import { FrontPortalController } from '../controllers/front-portal.controller';
import { FrontPortalBuilderService } from '../services/front-portal-builder.service';
import { FrontPortalPartsService } from '../services/front-portal-parts.service';
import { PortalAggregatePrismaRepository } from '../repositories/portal-aggregate.prisma.repository';
import { PortalAggregateRepository } from '../repositories/portal-aggregate.repository';
import { PortalScope } from '../repositories/portal-aggregate.types';
import { portalScopeOf } from '../mappers/portal-scope.util';
import { aggregateFixture, dealRow, portalRow, smartRow } from './fixtures';

/**
 * Узкая ручка портала: клиент называет части, сервер читает из БД только их
 * и отдаёт только их. Полная модель (POST front/portal) при этом не меняется.
 */

describe('portalScopeOf — что читать под запрошенные части', () => {
    it('читаются только сущности названных частей', () => {
        expect(portalScopeOf(new Set(['bitrixDeal', 'company']))).toEqual({
            entities: ['deal', 'company'],
            departaments: false,
            callings: false,
        });
    });

    it('плоские части (отдел, группа прозвона) сущностей не тянут', () => {
        expect(
            portalScopeOf(new Set(['departament', 'bitrixCallingTasksGroup'])),
        ).toEqual({ entities: [], departaments: true, callings: true });
    });

    it('типы смартов действуют только при запрошенных смартах', () => {
        expect(portalScopeOf(new Set(['smarts']), ['variant'])).toMatchObject({
            entities: ['smart'],
            smartTypes: ['variant'],
        });
        expect(
            portalScopeOf(new Set(['company']), ['variant']),
        ).not.toHaveProperty('smartTypes');
    });
});

describe('portalScopeOf — части без полей', () => {
    it('названные без полей читаются строками, остальные — целиком', () => {
        expect(
            portalScopeOf(new Set(['smarts', 'company']), undefined, [
                'smarts',
            ]),
        ).toMatchObject({
            entities: ['company', 'smart'],
            rowsOnly: ['smart'],
        });
    });

    it('«без полей» у незапрошенной части ничего не значит', () => {
        expect(
            portalScopeOf(new Set(['company']), undefined, ['smarts']),
        ).not.toHaveProperty('rowsOnly');
    });
});

describe('FrontPortalPartsService', () => {
    const createService = (findScopedByDomain: jest.Mock) =>
        new FrontPortalPartsService({
            findScopedByDomain,
        } as unknown as PortalAggregateRepository);

    it('отдаёт только запрошенные части — остальных ключей в ответе нет', async () => {
        const findScopedByDomain = jest.fn().mockResolvedValue(
            aggregateFixture(
                portalRow({
                    id: 7n,
                    btx_deals: [dealRow({ id: 3n })],
                    smarts: [smartRow({ id: 4n })],
                }),
            ),
        );
        const service = createService(findScopedByDomain);

        const result = await service.buildByDomain(
            'test.bitrix24.ru',
            ['bitrixDeal', 'smarts', 'company'],
            ['variant'],
        );

        expect(Object.keys(result).sort()).toEqual([
            'bitrixDeal',
            'company',
            'id',
            'smarts',
        ]);
        expect(result.id).toBe(7);
        expect(result.bitrixDeal?.id).toBe(3);
        expect(result.smarts).toHaveLength(1);
        // компании у портала нет — часть запрошена, значит ключ есть и он null
        expect(result.company).toBeNull();

        const [domain, scope] = findScopedByDomain.mock.calls[0] as [
            string,
            PortalScope,
        ];
        expect(domain).toBe('test.bitrix24.ru');
        expect(scope.entities).toEqual(['deal', 'company', 'smart']);
        expect(scope.smartTypes).toEqual(['variant']);
    });

    it('портала нет — 404, как у полной модели', async () => {
        const service = createService(jest.fn().mockResolvedValue(null));
        await expect(
            service.buildByDomain('unknown.bitrix24.ru', ['company']),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('PortalAggregatePrismaRepository.findScopedByDomain', () => {
    interface IncludeArg {
        include: Record<string, unknown>;
    }
    interface PolymorphicArg {
        where: { OR: { entity_type: string }[] };
    }

    const createPrisma = () => ({
        portal: { findFirst: jest.fn() },
        bitrixfields: { findMany: jest.fn().mockResolvedValue([]) },
        btx_categories: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const createRepository = (prisma: ReturnType<typeof createPrisma>) =>
        new PortalAggregatePrismaRepository(prisma as unknown as PrismaService);

    it('подключает только названные relations и только их поля', async () => {
        const prisma = createPrisma();
        // Prisma не возвращает неподключённые relations — в ответе их нет
        prisma.portal.findFirst.mockResolvedValue({
            id: 1n,
            domain: 'test.bitrix24.ru',
            btx_deals: [dealRow({ id: 3n })],
        });

        const aggregate = await createRepository(prisma).findScopedByDomain(
            'test.bitrix24.ru',
            { entities: ['deal'] },
        );

        const [{ include }] = prisma.portal.findFirst.mock.calls[0] as [
            IncludeArg,
        ];
        expect(include.btx_deals).toBe(true);
        expect(include.btx_companies).toBe(false);
        expect(include.smarts).toBe(false);
        expect(include.bitrixlists).toBe(false);

        const [{ where }] = prisma.bitrixfields.findMany.mock.calls[0] as [
            PolymorphicArg,
        ];
        expect(where.OR.map(pair => pair.entity_type)).toEqual([
            'App\\Models\\BtxDeal',
        ]);
        // непрошеное — пустыми коллекциями: мапперы полной модели работают как есть
        expect(aggregate?.portal.smarts).toEqual([]);
        expect(aggregate?.portal.btx_companies).toEqual([]);
        expect(aggregate?.portal.btx_deals).toHaveLength(1);
    });

    it('смарты фильтруются по типам в самом запросе', async () => {
        const prisma = createPrisma();
        prisma.portal.findFirst.mockResolvedValue({ id: 1n, smarts: [] });

        await createRepository(prisma).findScopedByDomain('test.bitrix24.ru', {
            entities: ['smart'],
            smartTypes: ['variant', 'service'],
        });

        const [{ include }] = prisma.portal.findFirst.mock.calls[0] as [
            IncludeArg,
        ];
        expect(include.smarts).toEqual({
            where: { type: { in: ['variant', 'service'] } },
        });
        // сущностей нет — поля и воронки не запрашиваются вовсе
        expect(prisma.bitrixfields.findMany).not.toHaveBeenCalled();
        expect(prisma.btx_categories.findMany).not.toHaveBeenCalled();
    });

    it('сущности «только строки» поля и воронки не читают', async () => {
        const prisma = createPrisma();
        prisma.portal.findFirst.mockResolvedValue({
            id: 1n,
            btx_deals: [dealRow({ id: 3n })],
            smarts: [smartRow({ id: 4n })],
        });

        const aggregate = await createRepository(prisma).findScopedByDomain(
            'test.bitrix24.ru',
            { entities: ['deal', 'smart'], rowsOnly: ['smart'] },
        );

        const [{ where }] = prisma.bitrixfields.findMany.mock.calls[0] as [
            PolymorphicArg,
        ];
        // поля читаются только для сделки; сама строка смарта при этом на месте
        expect(where.OR.map(pair => pair.entity_type)).toEqual([
            'App\\Models\\BtxDeal',
        ]);
        expect(aggregate?.portal.smarts).toHaveLength(1);
    });

    it('портала нет — null', async () => {
        const prisma = createPrisma();
        prisma.portal.findFirst.mockResolvedValue(null);
        await expect(
            createRepository(prisma).findScopedByDomain('x.bitrix24.ru', {
                entities: ['deal'],
            }),
        ).resolves.toBeNull();
    });
});

describe('FrontPortalController.getPortalParts', () => {
    it('передаёт домен, части и типы смартов в сервис', async () => {
        const buildByDomain = jest.fn().mockResolvedValue({ id: 1 });
        const controller = new FrontPortalController(
            {} as FrontPortalBuilderService,
            { buildByDomain } as unknown as FrontPortalPartsService,
        );

        const response = await controller.getPortalParts({
            domain: 'test.bitrix24.ru',
            parts: ['company'],
            smartTypes: undefined,
        });

        expect(buildByDomain).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            ['company'],
            undefined,
            undefined,
        );
        expect(response).toEqual({ id: 1 });
    });
});
