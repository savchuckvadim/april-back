/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import type { departaments } from 'generated/prisma';
import { PortalDepartamentService } from './portal-departament.service';
import { PortalDepartamentRepository } from '../repositories/portal-departament.repository';
import { EDepartamentGroup } from '../entity/portal-departament.entity';

function makeRow(over: Partial<departaments> = {}): departaments {
    return {
        id: BigInt(10),
        type: 'department',
        group: 'sales',
        name: 'Отдел продаж',
        title: 'Отдел продаж',
        bitrixId: BigInt(5),
        portal_id: BigInt(1),
        ...over,
    } as departaments;
}

describe('PortalDepartamentService', () => {
    let repo: jest.Mocked<PortalDepartamentRepository>;
    let service: PortalDepartamentService;

    beforeEach(() => {
        repo = {
            create: jest.fn(),
            findById: jest.fn(),
            findByTypeGroupPortal: jest.fn(),
            findByPortalId: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        } as unknown as jest.Mocked<PortalDepartamentRepository>;
        service = new PortalDepartamentService(repo);
    });

    describe('upsertByKey', () => {
        it('создаёт строку, если отдела с таким ключом нет', async () => {
            repo.findByTypeGroupPortal.mockResolvedValue(null);
            repo.create.mockResolvedValue(makeRow());

            const result = await service.upsertByKey(
                1,
                EDepartamentGroup.sales,
                { name: 'Отдел продаж', title: 'Отдел продаж', bitrixId: 5 },
            );

            expect(repo.findByTypeGroupPortal).toHaveBeenCalledWith(
                'department',
                EDepartamentGroup.sales,
                1,
            );
            expect(repo.create).toHaveBeenCalledTimes(1);
            expect(repo.update).not.toHaveBeenCalled();
            expect(result.bitrixId).toBe(5);
            expect(result.group).toBe(EDepartamentGroup.sales);
        });

        it('обновляет существующую строку по ключу type+group+portalId', async () => {
            repo.findByTypeGroupPortal.mockResolvedValue(
                makeRow({ id: BigInt(7) }),
            );
            repo.update.mockResolvedValue(
                makeRow({ id: BigInt(7), bitrixId: BigInt(99) }),
            );

            const result = await service.upsertByKey(
                1,
                EDepartamentGroup.sales,
                { name: 'Отдел продаж', title: 'Отдел продаж', bitrixId: 99 },
            );

            expect(repo.update).toHaveBeenCalledWith(7, {
                name: 'Отдел продаж',
                title: 'Отдел продаж',
                bitrixId: BigInt(99),
            });
            expect(repo.create).not.toHaveBeenCalled();
            expect(result.id).toBe(7);
            expect(result.bitrixId).toBe(99);
        });
    });

    describe('delete', () => {
        it('кидает NotFound, если строки нет', async () => {
            repo.findById.mockResolvedValue(null);
            await expect(service.delete(123)).rejects.toBeInstanceOf(
                NotFoundException,
            );
            expect(repo.delete).not.toHaveBeenCalled();
        });

        it('удаляет существующую строку', async () => {
            repo.findById.mockResolvedValue(makeRow());
            await service.delete(10);
            expect(repo.delete).toHaveBeenCalledWith(10);
        });
    });
});
