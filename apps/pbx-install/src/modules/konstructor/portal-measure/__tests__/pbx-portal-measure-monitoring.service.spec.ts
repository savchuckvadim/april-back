import { NotFoundException } from '@nestjs/common';
import { PbxPortalMeasureMonitoringService } from '../services/pbx-portal-measure-monitoring.service';

describe('PbxPortalMeasureMonitoringService', () => {
    let measureGetList: jest.Mock;
    let pbxService: { init: jest.Mock };
    let portalService: { getPortalByDomain: jest.Mock };
    let portalMeasureService: { findByPortalId: jest.Mock };
    let measureService: { findMany: jest.Mock };
    let service: PbxPortalMeasureMonitoringService;

    const portalMeasure = (over: Record<string, unknown> = {}) => ({
        id: BigInt(1),
        measure_id: BigInt(1),
        portal_id: BigInt(42),
        bitrixId: '5',
        name: 'Штука',
        shortName: 'шт',
        fullName: 'Штука',
        ...over,
    });

    beforeEach(() => {
        measureGetList = jest.fn();
        pbxService = {
            init: jest.fn().mockResolvedValue({
                bitrix: { measure: { getList: measureGetList } },
            }),
        };
        portalService = {
            getPortalByDomain: jest.fn().mockResolvedValue({ id: '42' }),
        };
        portalMeasureService = {
            findByPortalId: jest.fn().mockResolvedValue([]),
        };
        measureService = { findMany: jest.fn().mockResolvedValue([]) };
        service = new PbxPortalMeasureMonitoringService(
            pbxService as never,
            portalService as never,
            portalMeasureService as never,
            measureService as never,
        );
    });

    it('мерджит portalDB и Bitrix по bitrixId', async () => {
        portalMeasureService.findByPortalId.mockResolvedValue([
            portalMeasure(),
        ]);
        measureGetList.mockResolvedValue({
            result: {
                measures: [
                    {
                        ID: 5,
                        CODE: 796,
                        MEASURE_TITLE: 'Штука',
                        SYMBOL_RUS: 'шт',
                    },
                ],
            },
        });

        const res = await service.getByDomain('a.bx24.ru');

        expect(measureGetList).toHaveBeenCalledTimes(1);
        expect(res.mergedMeasures).toHaveLength(1);
        expect(res.mergedMeasures[0].portal?.id).toBe(1);
        expect(res.mergedMeasures[0].bitrix?.id).toBe(5);
        expect(res.portalMeasuresWithoutMerged).toHaveLength(0);
        expect(res.bitrixMeasuresWithoutMerged).toHaveLength(0);
    });

    it('единицу Bitrix без пары в PortalDB кладёт в bitrixMeasuresWithoutMerged', async () => {
        portalMeasureService.findByPortalId.mockResolvedValue([]);
        measureGetList.mockResolvedValue({
            result: { measures: [{ ID: 9, MEASURE_TITLE: 'Метр' }] },
        });

        const res = await service.getByDomain('a.bx24.ru');

        expect(res.mergedMeasures).toHaveLength(1);
        expect(res.mergedMeasures[0].portal).toBeNull();
        expect(res.bitrixMeasuresWithoutMerged).toHaveLength(1);
        expect(res.bitrixMeasuresWithoutMerged[0].id).toBe(9);
    });

    it('портальную единицу без пары в Bitrix кладёт в portalMeasuresWithoutMerged', async () => {
        portalMeasureService.findByPortalId.mockResolvedValue([
            portalMeasure({ id: BigInt(2), bitrixId: null }),
        ]);
        measureGetList.mockResolvedValue({ result: { measures: [] } });

        const res = await service.getByDomain('a.bx24.ru');

        expect(res.mergedMeasures).toHaveLength(1);
        expect(res.mergedMeasures[0].bitrix).toBeNull();
        expect(res.portalMeasuresWithoutMerged).toHaveLength(1);
        expect(res.portalMeasuresWithoutMerged[0].id).toBe(2);
    });

    it('бросает NotFound, если портал не найден', async () => {
        portalService.getPortalByDomain.mockResolvedValue(null);

        await expect(service.getByDomain('missing')).rejects.toThrow(
            NotFoundException,
        );
        expect(pbxService.init).not.toHaveBeenCalled();
    });
});
