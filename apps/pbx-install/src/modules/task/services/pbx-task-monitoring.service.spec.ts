import { PbxTaskMonitoringService } from './pbx-task-monitoring.service';

describe('PbxTaskMonitoringService', () => {
    let pbxService: { init: jest.Mock };
    let portalService: { getPortals: jest.Mock };
    let parseService: { getFields: jest.Mock };
    let service: PbxTaskMonitoringService;

    const bitrixWith = (fields: unknown[]) => ({
        bitrix: {
            taskUserField: {
                getList: jest.fn().mockResolvedValue({ result: fields }),
            },
        },
    });

    beforeEach(() => {
        pbxService = { init: jest.fn() };
        portalService = { getPortals: jest.fn() };
        parseService = { getFields: jest.fn() };
        service = new PbxTaskMonitoringService(
            pbxService as never,
            portalService as never,
            parseService as never,
        );
    });

    it('listBitrixFields отдаёт только UF_TASK_-поля', async () => {
        pbxService.init.mockResolvedValue(
            bitrixWith([
                { FIELD_NAME: 'UF_TASK_EVENT_COMMENT' },
                { FIELD_NAME: 'UF_CRM_OTHER' },
            ]),
        );

        const res = await service.listBitrixFields('d.bitrix24.ru');

        expect(res.domain).toBe('d.bitrix24.ru');
        expect(res.fields.map(f => f.FIELD_NAME)).toEqual([
            'UF_TASK_EVENT_COMMENT',
        ]);
    });

    it('getByDomain: installed / not_installed / untracked', async () => {
        parseService.getFields.mockReturnValue([
            { code: 'event_comment', bxFieldName: 'EVENT_COMMENT' },
            { code: 'missing', bxFieldName: 'MISSING' },
        ]);
        pbxService.init.mockResolvedValue(
            bitrixWith([
                { FIELD_NAME: 'UF_TASK_EVENT_COMMENT' },
                { FIELD_NAME: 'UF_TASK_UNTRACKED' },
            ]),
        );

        const res = await service.getByDomain('d.bitrix24.ru');

        const byName = Object.fromEntries(
            res.mergedFields.map(m => [m.name, m.status]),
        );
        expect(byName['UF_TASK_EVENT_COMMENT']).toBe('installed');
        expect(byName['UF_TASK_MISSING']).toBe('not_installed');
        expect(res.bitrixFieldsWithoutTemplate.map(f => f.FIELD_NAME)).toEqual([
            'UF_TASK_UNTRACKED',
        ]);
        expect(res.summary).toEqual({
            total: 2,
            installed: 1,
            notInstalled: 1,
            untracked: 1,
        });
    });

    it('getAll собирает perPortal и errors, пропускает пустой домен', async () => {
        portalService.getPortals.mockResolvedValue([
            { id: 7, domain: 'a.ru' },
            { id: 8, domain: 'b.ru' },
            { id: 9, domain: null },
        ]);
        parseService.getFields.mockReturnValue([]);
        pbxService.init.mockImplementation((d: string) =>
            d === 'a.ru'
                ? Promise.resolve(bitrixWith([]))
                : Promise.reject(new Error('bitrix down')),
        );

        const res = await service.getAll();

        expect(res.perPortal.map(p => p.domain)).toEqual(['a.ru']);
        expect(res.errors).toEqual([{ domain: 'b.ru', error: 'bitrix down' }]);
    });
});
