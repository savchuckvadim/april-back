/* eslint-disable @typescript-eslint/unbound-method */
import type { callings } from 'generated/prisma';
import { PortalCallingService } from './portal-calling.service';
import { PortalCallingRepository } from '../repositories/portal-calling.repository';
import { ECallingGroup } from '../entity/portal-calling.entity';

function makeRow(over: Partial<callings> = {}): callings {
    return {
        id: BigInt(10),
        type: 'calling',
        group: 'sales',
        name: 'ОП Звонки',
        title: 'ОП Звонки',
        bitrixId: BigInt(42),
        portal_id: BigInt(1),
        ...over,
    } as callings;
}

describe('PortalCallingService.upsertByKey', () => {
    let repo: jest.Mocked<PortalCallingRepository>;
    let service: PortalCallingService;

    beforeEach(() => {
        repo = {
            create: jest.fn(),
            findById: jest.fn(),
            findByTypeGroupPortal: jest.fn(),
            findByPortalId: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        } as unknown as jest.Mocked<PortalCallingRepository>;
        service = new PortalCallingService(repo);
    });

    it('создаёт строку, если группы с таким ключом нет', async () => {
        repo.findByTypeGroupPortal.mockResolvedValue(null);
        repo.create.mockResolvedValue(makeRow());

        const result = await service.upsertByKey(1, ECallingGroup.sales, {
            name: 'ОП Звонки',
            title: 'ОП Звонки',
            bitrixId: 42,
        });

        expect(repo.findByTypeGroupPortal).toHaveBeenCalledWith(
            'calling',
            ECallingGroup.sales,
            1,
        );
        expect(repo.create).toHaveBeenCalledTimes(1);
        expect(repo.update).not.toHaveBeenCalled();
        expect(result.bitrixId).toBe(42);
        expect(result.group).toBe(ECallingGroup.sales);
    });

    it('обновляет существующую строку по ключу type+group+portalId', async () => {
        repo.findByTypeGroupPortal.mockResolvedValue(
            makeRow({ id: BigInt(7) }),
        );
        repo.update.mockResolvedValue(
            makeRow({ id: BigInt(7), bitrixId: BigInt(99) }),
        );

        const result = await service.upsertByKey(1, ECallingGroup.sales, {
            name: 'ОП Звонки',
            title: 'ОП Звонки',
            bitrixId: 99,
        });

        expect(repo.update).toHaveBeenCalledWith(7, {
            name: 'ОП Звонки',
            title: 'ОП Звонки',
            bitrixId: BigInt(99),
        });
        expect(repo.create).not.toHaveBeenCalled();
        expect(result.id).toBe(7);
        expect(result.bitrixId).toBe(99);
    });
});
