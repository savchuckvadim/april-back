import { NotFoundException } from '@nestjs/common';
import { PbxUserMonitoringService } from './pbx-user-monitoring.service';

describe('PbxUserMonitoringService', () => {
    let pbxService: { init: jest.Mock };
    let portalService: { getPortalByDomain: jest.Mock; getPortals: jest.Mock };
    let pbxUserService: { findByPortalId: jest.Mock };
    let parseService: { getFields: jest.Mock };
    let service: PbxUserMonitoringService;

    const bitrixWith = (fields: unknown[]) => ({
        bitrix: {
            user: {
                listFields: jest.fn().mockResolvedValue({ result: fields }),
            },
        },
    });

    beforeEach(() => {
        pbxService = { init: jest.fn() };
        portalService = {
            getPortalByDomain: jest.fn().mockResolvedValue({ id: 7 }),
            getPortals: jest.fn(),
        };
        pbxUserService = { findByPortalId: jest.fn() };
        parseService = { getFields: jest.fn() };
        service = new PbxUserMonitoringService(
            pbxService as never,
            portalService as never,
            pbxUserService as never,
            parseService as never,
        );
    });

    it('synced: поле есть в шаблоне, БД и Bitrix', async () => {
        parseService.getFields.mockReturnValue([
            { code: 'event_comment', bxFieldName: 'EVENT_COMMENT' },
        ]);
        pbxUserService.findByPortalId.mockResolvedValue({
            id: '42',
            fields: [{ code: 'event_comment', bitrixId: 'EVENT_COMMENT' }],
        });
        pbxService.init.mockResolvedValue(
            bitrixWith([{ FIELD_NAME: 'UF_USR_EVENT_COMMENT' }]),
        );

        const res = await service.getByDomain('d.bitrix24.ru');

        expect(res.userId).toBe(42);
        expect(res.mergedFields[0].status).toBe('synced');
        expect(res.summary).toEqual({
            total: 1,
            synced: 1,
            missingInDb: 0,
            missingInBitrix: 0,
            onlyTemplate: 0,
        });
        expect(res.dbFieldsWithoutMerged).toHaveLength(0);
        expect(res.bitrixFieldsWithoutMerged).toHaveLength(0);
    });

    it('missing_in_bitrix: есть в БД, нет в Bitrix', async () => {
        parseService.getFields.mockReturnValue([
            { code: 'event_comment', bxFieldName: 'EVENT_COMMENT' },
        ]);
        pbxUserService.findByPortalId.mockResolvedValue({
            id: '42',
            fields: [{ code: 'event_comment', bitrixId: 'EVENT_COMMENT' }],
        });
        pbxService.init.mockResolvedValue(bitrixWith([]));

        const res = await service.getByDomain('d.bitrix24.ru');

        expect(res.mergedFields[0].status).toBe('missing_in_bitrix');
        expect(res.summary.missingInBitrix).toBe(1);
    });

    it('missing_in_db: есть в Bitrix, нет в БД (userId=null при NotFound)', async () => {
        parseService.getFields.mockReturnValue([
            { code: 'event_comment', bxFieldName: 'EVENT_COMMENT' },
        ]);
        pbxUserService.findByPortalId.mockRejectedValue(
            new NotFoundException(),
        );
        pbxService.init.mockResolvedValue(
            bitrixWith([{ FIELD_NAME: 'UF_USR_EVENT_COMMENT' }]),
        );

        const res = await service.getByDomain('d.bitrix24.ru');

        expect(res.userId).toBeNull();
        expect(res.mergedFields[0].status).toBe('missing_in_db');
    });

    it('only_template + orphan-поля в БД и Bitrix', async () => {
        parseService.getFields.mockReturnValue([
            { code: 'event_comment', bxFieldName: 'EVENT_COMMENT' },
        ]);
        pbxUserService.findByPortalId.mockResolvedValue({
            id: '42',
            fields: [{ code: 'old', bitrixId: 'OLD_FIELD' }],
        });
        pbxService.init.mockResolvedValue(
            bitrixWith([{ FIELD_NAME: 'UF_USR_UNMANAGED' }]),
        );

        const res = await service.getByDomain('d.bitrix24.ru');

        expect(res.mergedFields[0].status).toBe('only_template');
        expect(res.dbFieldsWithoutMerged.map(f => f.bitrixId)).toEqual([
            'OLD_FIELD',
        ]);
        expect(res.bitrixFieldsWithoutMerged.map(f => f.FIELD_NAME)).toEqual([
            'UF_USR_UNMANAGED',
        ]);
    });

    it('бросает NotFound, если портал не найден', async () => {
        portalService.getPortalByDomain.mockResolvedValue(null);
        await expect(service.getByDomain('x')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('getAll собирает perPortal и errors, пропускает пустой домен', async () => {
        portalService.getPortals.mockResolvedValue([
            { id: 7, domain: 'a.ru' },
            { id: 8, domain: 'b.ru' },
            { id: 9, domain: null },
        ]);
        parseService.getFields.mockReturnValue([]);
        portalService.getPortalByDomain.mockImplementation((d: string) =>
            Promise.resolve({ id: d === 'a.ru' ? 7 : 8 }),
        );
        pbxUserService.findByPortalId.mockResolvedValue({
            id: '1',
            fields: [],
        });
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
