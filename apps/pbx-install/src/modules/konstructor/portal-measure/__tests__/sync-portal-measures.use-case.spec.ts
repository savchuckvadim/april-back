import { NotFoundException } from '@nestjs/common';
import { SyncPortalMeasuresUseCase } from '../use-cases/sync-portal-measures.use-case';

describe('SyncPortalMeasuresUseCase', () => {
    let portalService: { getPortalByDomain: jest.Mock };
    let syncService: { syncFromGlobal: jest.Mock };
    let portalMeasureService: { findByPortalId: jest.Mock };
    let useCase: SyncPortalMeasuresUseCase;

    beforeEach(() => {
        portalService = {
            getPortalByDomain: jest.fn().mockResolvedValue({ id: '42' }),
        };
        syncService = {
            syncFromGlobal: jest
                .fn()
                .mockResolvedValue({ created: 1, updated: 2, total: 3 }),
        };
        portalMeasureService = {
            findByPortalId: jest.fn().mockResolvedValue([]),
        };
        useCase = new SyncPortalMeasuresUseCase(
            portalService as never,
            syncService as never,
            portalMeasureService as never,
        );
    });

    it('резолвит портал по domain и запускает синхронизацию', async () => {
        const result = await useCase.syncByDomain('a.bx24.ru');

        expect(portalService.getPortalByDomain).toHaveBeenCalledWith(
            'a.bx24.ru',
        );
        expect(syncService.syncFromGlobal).toHaveBeenCalledWith(42);
        expect(result).toEqual({ created: 1, updated: 2, total: 3 });
    });

    it('бросает NotFound, если портал по domain не найден', async () => {
        portalService.getPortalByDomain.mockResolvedValue(null);

        await expect(useCase.syncByDomain('missing.bx24.ru')).rejects.toThrow(
            NotFoundException,
        );
        expect(syncService.syncFromGlobal).not.toHaveBeenCalled();
    });

    it('listByDomain отдаёт portal_measure портала', async () => {
        portalMeasureService.findByPortalId.mockResolvedValue([{ id: 1 }]);

        const list = await useCase.listByDomain('a.bx24.ru');

        expect(portalMeasureService.findByPortalId).toHaveBeenCalledWith(42);
        expect(list).toEqual([{ id: 1 }]);
    });
});
