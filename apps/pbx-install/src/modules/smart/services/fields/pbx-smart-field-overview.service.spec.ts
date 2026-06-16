import { PbxSmartFieldOverviewService } from './pbx-smart-field-overview.service';

describe('PbxSmartFieldOverviewService', () => {
    let pbxService: { init: jest.Mock };
    let portalService: { getPortals: jest.Mock };
    let portalSmartService: { findFirstByPortalTypeGroup: jest.Mock };
    let pbxFieldService: { findByEntityId: jest.Mock };
    let parseService: { getParsedData: jest.Mock };
    let service: PbxSmartFieldOverviewService;

    beforeEach(() => {
        pbxService = {
            init: jest.fn().mockResolvedValue({
                bitrix: {
                    userFieldConfig: {
                        getAllWithItems: jest.fn().mockResolvedValue([
                            { fieldName: 'UF_CRM_8_A', xmlId: 'a' },
                            {
                                fieldName: 'UF_CRM_8_BX',
                                xmlId: 'bitrix_only_code',
                            },
                        ]),
                    },
                },
            }),
        };
        portalService = {
            getPortals: jest
                .fn()
                .mockResolvedValue([{ id: 7, domain: 'd.ru' }]),
        };
        portalSmartService = {
            findFirstByPortalTypeGroup: jest.fn((_p, type, group) =>
                type === 'service_offer' && group === 'service'
                    ? Promise.resolve({ id: 5n, bitrixId: 8 })
                    : Promise.resolve(null),
            ),
        };
        pbxFieldService = {
            findByEntityId: jest.fn().mockResolvedValue([
                { code: 'a', bitrixId: 'UF_CRM_8_A' },
                { code: 'db_only', bitrixId: 'UF_CRM_8_DBONLY' },
            ]),
        };
        parseService = {
            getParsedData: jest.fn((name, group) =>
                name === 'service_offer' && group === 'service'
                    ? Promise.resolve([
                          {
                              fields: [
                                  { code: 'a', isNeedUpdate: true },
                                  { code: 'only_template', isNeedUpdate: true },
                              ],
                          },
                      ])
                    : Promise.resolve([]),
            ),
        };
        service = new PbxSmartFieldOverviewService(
            pbxService as never,
            portalService as never,
            portalSmartService as never,
            pbxFieldService as never,
            parseService as never,
        );
    });

    it('агрегирует только установленные/шаблонные комбо и считает статусы', async () => {
        const res = await service.getAllPortals();

        expect(res.errors).toEqual([]);
        expect(res.perPortal).toHaveLength(1);
        const portal = res.perPortal[0];
        expect(portal.domain).toBe('d.ru');
        expect(portal.smarts).toHaveLength(1);

        const combo = portal.smarts[0];
        expect(combo.smartName).toBe('service_offer');
        expect(combo.group).toBe('service');
        expect(combo.hasTemplate).toBe(true);
        expect(combo.installedInDb).toBe(true);

        const byCode = Object.fromEntries(
            combo.fields.map(f => [f.code, f.status]),
        );
        expect(byCode['a']).toBe('synced');
        expect(byCode['only_template']).toBe('template_only');
        expect(byCode['db_only']).toBe('db_only');
        expect(byCode['bitrix_only_code']).toBe('bitrix_only');
    });

    it('собирает ошибки по порталу в errors', async () => {
        pbxService.init.mockRejectedValue(new Error('bitrix down'));
        const res = await service.getAllPortals();
        expect(res.perPortal).toEqual([]);
        expect(res.errors).toEqual([{ domain: 'd.ru', error: 'bitrix down' }]);
    });
});
