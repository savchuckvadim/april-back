import { PbxRpaFieldMonitoringService } from './pbx-rpa-field-monitoring.service';
import { RpaNameEnum } from '../../dto/install-rpa.dto';

/**
 * Регрессия `rpa-smart-field-monitoring-pagination`: мониторинг обязан читать поля
 * Bitrix постранично (`userFieldConfig.getAllWithItems`), а не одной страницей `list`,
 * иначе поле сверх ~50 на страницу (репро: `UF_RPA_1_SALE_DATE`) пропадает из сводки.
 * `getAllWithItems` (а не `getAll`) — чтобы для enum-полей дотягивались значения списка.
 */
describe('PbxRpaFieldMonitoringService', () => {
    let pbxService: { init: jest.Mock };
    let portalService: { getPortalByDomain: jest.Mock };
    let portalRpaService: { findFirstByPortalAndCode: jest.Mock };
    let pbxFieldService: { findByEntityId: jest.Mock };
    let getAllWithItems: jest.Mock;
    let list: jest.Mock;
    let service: PbxRpaFieldMonitoringService;

    const DOMAIN = 'garantservisvoronezh.bitrix24.ru';

    beforeEach(() => {
        getAllWithItems = jest.fn();
        list = jest.fn();
        pbxService = {
            init: jest.fn().mockResolvedValue({
                bitrix: { userFieldConfig: { getAllWithItems, list } },
            }),
        };
        portalService = {
            getPortalByDomain: jest.fn().mockResolvedValue({ id: 1 }),
        };
        portalRpaService = {
            findFirstByPortalAndCode: jest
                .fn()
                .mockResolvedValue({ id: 10, typeId: 1 }),
        };
        pbxFieldService = { findByEntityId: jest.fn().mockResolvedValue([]) };
        service = new PbxRpaFieldMonitoringService(
            pbxService as never,
            portalService as never,
            portalRpaService as never,
            pbxFieldService as never,
        );
    });

    it('читает Bitrix через getAllWithItems(rpa, { entityId }), а не одной страницей list', async () => {
        getAllWithItems.mockResolvedValue([]);

        await service.getPbxRpaFieldsByDomain(DOMAIN, RpaNameEnum.SUPPLY);

        expect(getAllWithItems).toHaveBeenCalledWith('rpa', {
            entityId: 'RPA_1',
        });
        expect(list).not.toHaveBeenCalled();
    });

    it('поле, существующее в Bitrix, но не в PortalDB, попадает в bitrixFieldsWithoutMerged', async () => {
        getAllWithItems.mockResolvedValue([
            { fieldName: 'UF_RPA_1_SALE_DATE', id: 999 },
        ]);

        const res = await service.getPbxRpaFieldsByDomain(
            DOMAIN,
            RpaNameEnum.SUPPLY,
        );

        expect(res.mergedFields).toHaveLength(0);
        expect(res.bitrixFieldsWithoutMerged.map(f => f.fieldName)).toContain(
            'UF_RPA_1_SALE_DATE',
        );
    });

    it('поле, присутствующее и в Bitrix, и в PortalDB, мерджится', async () => {
        pbxFieldService.findByEntityId.mockResolvedValue([
            { id: 5, bitrixId: 'UF_RPA_1_AMOUNT' },
        ]);
        getAllWithItems.mockResolvedValue([
            { fieldName: 'UF_RPA_1_AMOUNT', id: 1 },
        ]);

        const res = await service.getPbxRpaFieldsByDomain(
            DOMAIN,
            RpaNameEnum.SUPPLY,
        );

        expect(res.mergedFields.map(m => m.name)).toEqual(['UF_RPA_1_AMOUNT']);
        expect(res.bitrixFieldsWithoutMerged).toHaveLength(0);
        expect(res.portalFieldsWithoutMerged).toHaveLength(0);
    });
});
