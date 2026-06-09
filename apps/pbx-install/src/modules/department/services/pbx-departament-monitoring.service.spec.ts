import { NotFoundException } from '@nestjs/common';
import { PbxDepartamentMonitoringService } from './pbx-departament-monitoring.service';

jest.mock(
    '@/modules/bitrix/domain/department/services/department-bitrxi.service',
    () => ({
        DepartmentBitrixService: jest.fn().mockImplementation(() => ({
            getDepartmentsAll: jest.fn().mockResolvedValue([
                { ID: 5, NAME: 'Отдел продаж', PARENT: '1', SORT: 100 },
                { ID: 9, NAME: 'Другой', PARENT: '1', SORT: 200 },
            ]),
        })),
    }),
);

describe('PbxDepartamentMonitoringService', () => {
    let pbxService: { init: jest.Mock };
    let portalDepartamentService: { findByPortalId: jest.Mock };
    let portalService: { getPortalByDomain: jest.Mock };
    let service: PbxDepartamentMonitoringService;

    beforeEach(() => {
        pbxService = {
            init: jest.fn().mockResolvedValue({ bitrix: {} }),
        };
        portalDepartamentService = {
            findByPortalId: jest.fn().mockResolvedValue([
                { id: 1, bitrixId: 5, group: 'sales' },
                { id: 2, bitrixId: 100, group: 'service' },
            ]),
        };
        portalService = {
            getPortalByDomain: jest.fn().mockResolvedValue({ id: 1 }),
        };
        service = new PbxDepartamentMonitoringService(
            pbxService as never,
            portalDepartamentService as never,
            portalService as never,
        );
    });

    it('мержит по bitrixId и раскладывает расхождения', async () => {
        const res = await service.getPbxDepartamentData('test.bitrix24.ru');

        expect(res.merged).toHaveLength(1);
        expect(res.merged[0].bitrixId).toBe(5);
        expect(res.portalWithoutMerged.map(p => p.id)).toEqual([2]);
        expect(res.bitrixWithoutMerged.map(d => Number(d.ID))).toEqual([9]);
    });

    it('кидает NotFound, если портал не найден', async () => {
        portalService.getPortalByDomain.mockResolvedValue(null);
        await expect(service.getPbxDepartamentData('x')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});
