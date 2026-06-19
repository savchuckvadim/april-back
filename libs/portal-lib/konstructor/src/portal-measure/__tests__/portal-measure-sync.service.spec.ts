import { PortalMeasureSyncService } from '../portal-measure-sync.service';

describe('PortalMeasureSyncService', () => {
    let measureRepository: { findMany: jest.Mock };
    let portalMeasureRepository: {
        findByPortalAndMeasure: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        findByPortalId: jest.Mock;
    };
    let service: PortalMeasureSyncService;

    const portalId = 10;

    beforeEach(() => {
        measureRepository = { findMany: jest.fn() };
        portalMeasureRepository = {
            findByPortalAndMeasure: jest.fn(),
            create: jest.fn().mockResolvedValue({ id: 1 }),
            update: jest.fn().mockResolvedValue({ id: 1 }),
            findByPortalId: jest.fn().mockResolvedValue([]),
        };
        service = new PortalMeasureSyncService(
            measureRepository as never,
            portalMeasureRepository as never,
        );
    });

    it('создаёт portal_measure для отсутствующих глобальных measure', async () => {
        measureRepository.findMany.mockResolvedValue([
            {
                id: BigInt(1),
                name: 'Штука',
                shortName: 'шт',
                fullName: 'Штука',
            },
        ]);
        portalMeasureRepository.findByPortalAndMeasure.mockResolvedValue(null);
        portalMeasureRepository.findByPortalId.mockResolvedValue([{ id: 1 }]);

        const result = await service.syncFromGlobal(portalId);

        expect(portalMeasureRepository.create).toHaveBeenCalledTimes(1);
        expect(portalMeasureRepository.create).toHaveBeenCalledWith({
            portal_id: BigInt(portalId),
            measure_id: BigInt(1),
            name: 'Штука',
            shortName: 'шт',
            fullName: 'Штука',
        });
        expect(portalMeasureRepository.update).not.toHaveBeenCalled();
        expect(result).toEqual({ created: 1, updated: 0, total: 1 });
    });

    it('не дублирует существующие связки, а обновляет их', async () => {
        measureRepository.findMany.mockResolvedValue([
            {
                id: BigInt(2),
                name: 'Метр',
                shortName: 'м',
                fullName: 'Метр',
            },
        ]);
        portalMeasureRepository.findByPortalAndMeasure.mockResolvedValue({
            id: BigInt(55),
        });
        portalMeasureRepository.findByPortalId.mockResolvedValue([{ id: 55 }]);

        const result = await service.syncFromGlobal(portalId);

        expect(portalMeasureRepository.create).not.toHaveBeenCalled();
        expect(portalMeasureRepository.update).toHaveBeenCalledWith(55, {
            name: 'Метр',
            shortName: 'м',
            fullName: 'Метр',
        });
        expect(result).toEqual({ created: 0, updated: 1, total: 1 });
    });

    it('возвращает нулевую сводку при пустом глобальном справочнике', async () => {
        measureRepository.findMany.mockResolvedValue([]);
        portalMeasureRepository.findByPortalId.mockResolvedValue([]);

        const result = await service.syncFromGlobal(portalId);

        expect(portalMeasureRepository.create).not.toHaveBeenCalled();
        expect(portalMeasureRepository.update).not.toHaveBeenCalled();
        expect(result).toEqual({ created: 0, updated: 0, total: 0 });
    });
});
