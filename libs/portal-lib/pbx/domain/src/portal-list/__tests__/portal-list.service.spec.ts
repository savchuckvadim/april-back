import { NotFoundException } from '@nestjs/common';
import { PortalListService } from '../portal-list.service';
import { PrismaService } from '@/core/prisma';
import { PbxFieldService } from '@lib/portal-lib/pbx-domain/field/';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PbxEntityTypePrisma } from '@/shared/enums';

/**
 * Тесты PortalListService: upsert по ключу (portal_id, type, group),
 * каскадное удаление полей BITRIX_LIST и отсутствие портала → исключение.
 */
describe('PortalListService', () => {
    let service: PortalListService;
    let prisma: {
        bitrixlists: {
            findFirst: jest.Mock;
            create: jest.Mock;
            update: jest.Mock;
            delete: jest.Mock;
        };
        portal: { findFirst: jest.Mock };
    };
    let pbxFieldService: {
        findByEntityId: jest.Mock;
        deleteFieldsByEntityId: jest.Mock;
    };
    let portalStore: { getPortalByDomain: jest.Mock };

    const row = {
        id: BigInt(7),
        type: 'kpi',
        group: 'sales',
        name: 'ОП KPI',
        title: 'ОП KPI',
        bitrixId: BigInt(41),
        portal_id: BigInt(3),
    };

    beforeEach(() => {
        prisma = {
            bitrixlists: {
                findFirst: jest.fn(),
                create: jest.fn().mockResolvedValue(row),
                update: jest.fn().mockResolvedValue(row),
                delete: jest.fn().mockResolvedValue(row),
            },
            portal: { findFirst: jest.fn() },
        };
        pbxFieldService = {
            findByEntityId: jest.fn().mockResolvedValue([]),
            deleteFieldsByEntityId: jest.fn().mockResolvedValue(undefined),
        };
        portalStore = {
            getPortalByDomain: jest.fn().mockResolvedValue({ id: 3 }),
        };
        service = new PortalListService(
            prisma as unknown as PrismaService,
            pbxFieldService as unknown as PbxFieldService,
            portalStore as unknown as PortalStoreService,
        );
    });

    describe('upsertFromBitrix', () => {
        const data = {
            type: 'kpi',
            group: 'sales',
            name: 'ОП KPI',
            title: 'ОП KPI',
            bitrixId: 41,
        };

        it('создаёт строку, если списка (portal_id, type, group) ещё нет', async () => {
            prisma.bitrixlists.findFirst.mockResolvedValue(null);

            await service.upsertFromBitrix('test.bitrix24.ru', data);

            expect(prisma.bitrixlists.create).toHaveBeenCalledWith({
                data: {
                    portal_id: BigInt(3),
                    type: 'kpi',
                    group: 'sales',
                    name: 'ОП KPI',
                    title: 'ОП KPI',
                    bitrixId: BigInt(41),
                },
            });
            expect(prisma.bitrixlists.update).not.toHaveBeenCalled();
        });

        it('обновляет существующую строку без смены type/group', async () => {
            prisma.bitrixlists.findFirst.mockResolvedValue(row);

            await service.upsertFromBitrix('test.bitrix24.ru', {
                ...data,
                title: 'Новый заголовок',
            });

            expect(prisma.bitrixlists.create).not.toHaveBeenCalled();
            expect(prisma.bitrixlists.update).toHaveBeenCalledWith({
                where: { id: BigInt(7) },
                data: {
                    name: 'ОП KPI',
                    title: 'Новый заголовок',
                    bitrixId: BigInt(41),
                },
            });
        });

        it('портал не найден → NotFoundException', async () => {
            portalStore.getPortalByDomain.mockResolvedValue(null);

            await expect(
                service.upsertFromBitrix('unknown.bitrix24.ru', data),
            ).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('deleteListCascade', () => {
        it('удаляет поля BITRIX_LIST, затем строку списка', async () => {
            const result = await service.deleteListCascade(BigInt(7));

            expect(pbxFieldService.deleteFieldsByEntityId).toHaveBeenCalledWith(
                PbxEntityTypePrisma.BITRIX_LIST,
                BigInt(7),
            );
            expect(prisma.bitrixlists.delete).toHaveBeenCalledWith({
                where: { id: BigInt(7) },
            });
            expect(result).toEqual({ deleted: 7 });
        });
    });

    describe('getListsByPortalDomain', () => {
        it('портал не найден → NotFoundException', async () => {
            prisma.portal.findFirst.mockResolvedValue(null);

            await expect(
                service.getListsByPortalDomain('unknown.bitrix24.ru'),
            ).rejects.toBeInstanceOf(NotFoundException);
        });

        it('собирает entity списков с полями и вычисленным code', async () => {
            prisma.portal.findFirst.mockResolvedValue({
                id: BigInt(3),
                domain: 'test.bitrix24.ru',
                bitrixlists: [row],
            });

            const result =
                await service.getListsByPortalDomain('test.bitrix24.ru');

            expect(pbxFieldService.findByEntityId).toHaveBeenCalledWith(
                PbxEntityTypePrisma.BITRIX_LIST,
                BigInt(7),
            );
            expect(result.lists).toHaveLength(1);
            expect(result.lists[0]).toMatchObject({
                id: 7,
                portalId: 3,
                type: 'kpi',
                group: 'sales',
                code: 'sales_kpi',
                bitrixId: 41,
            });
        });
    });
});
