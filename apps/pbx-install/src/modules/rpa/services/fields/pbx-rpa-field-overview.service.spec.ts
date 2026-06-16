import { PbxRpaFieldOverviewService } from './pbx-rpa-field-overview.service';

describe('PbxRpaFieldOverviewService', () => {
    let pbxService: { init: jest.Mock };
    let portalService: { getPortals: jest.Mock };
    let portalRpaService: { findFirstByPortalAndCode: jest.Mock };
    let pbxFieldService: { findByEntityId: jest.Mock };
    let parseService: { getParsedData: jest.Mock };
    let service: PbxRpaFieldOverviewService;

    beforeEach(() => {
        pbxService = {
            init: jest.fn().mockResolvedValue({
                bitrix: {
                    userFieldConfig: {
                        getAllWithItems: jest.fn().mockResolvedValue([
                            { fieldName: 'UF_RPA_A', xmlId: 'a' },
                            {
                                fieldName: 'UF_RPA_BX',
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
        portalRpaService = {
            findFirstByPortalAndCode: jest.fn((_p, rpaName) =>
                rpaName === 'supply'
                    ? Promise.resolve({ id: 5n, typeId: 12 })
                    : Promise.resolve(null),
            ),
        };
        pbxFieldService = {
            findByEntityId: jest.fn().mockResolvedValue([
                { code: 'a', bitrixId: 'UF_RPA_A' },
                { code: 'db_only', bitrixId: 'UF_RPA_DBONLY' },
            ]),
        };
        parseService = {
            getParsedData: jest.fn((name, group) =>
                name === 'supply' && group === 'sales'
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
        service = new PbxRpaFieldOverviewService(
            pbxService as never,
            portalService as never,
            portalRpaService as never,
            pbxFieldService as never,
            parseService as never,
        );
    });

    it('агрегирует комбо RPA и считает статусы (шаблон — истина)', async () => {
        const res = await service.getAllPortals();

        expect(res.errors).toEqual([]);
        const portal = res.perPortal[0];
        // supply установлен → 3 группы (general/service/sales); presentation пропущен.
        expect(portal.rpa).toHaveLength(3);
        expect(portal.rpa.every(c => String(c.rpaName) === 'supply')).toBe(
            true,
        );

        const sales = portal.rpa.find(c => String(c.group) === 'sales');
        expect(sales?.hasTemplate).toBe(true);
        const byCode = Object.fromEntries(
            (sales?.fields ?? []).map(f => [f.code, f.status]),
        );
        expect(byCode['a']).toBe('synced');
        expect(byCode['only_template']).toBe('template_only');
        expect(byCode['bitrix_only_code']).toBe('bitrix_only');
        expect(byCode['db_only']).toBe('db_only');
    });
});
