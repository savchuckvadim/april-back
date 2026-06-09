import { NotFoundException } from '@nestjs/common';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PortalRpaService } from '@lib/portal-lib/pbx-domain/portal-rpa/portal-rpa.service';
import { PbxEntityType } from '@/shared/enums';
import { RpaContextResolver } from './rpa-context.resolver';

describe('RpaContextResolver', () => {
    let resolver: RpaContextResolver;
    let portalService: jest.Mocked<
        Pick<PortalStoreService, 'getPortalByDomain'>
    >;
    let portalRpaService: jest.Mocked<
        Pick<PortalRpaService, 'findFirstByPortalAndCode'>
    >;

    beforeEach(() => {
        portalService = { getPortalByDomain: jest.fn() };
        portalRpaService = { findFirstByPortalAndCode: jest.fn() };
        resolver = new RpaContextResolver(
            portalService as unknown as PortalStoreService,
            portalRpaService as unknown as PortalRpaService,
        );
    });

    it('строит ctx для userfieldconfig (moduleId rpa) и owner BTX_RPA', async () => {
        portalService.getPortalByDomain.mockResolvedValue({ id: 1 } as never);
        portalRpaService.findFirstByPortalAndCode.mockResolvedValue({
            id: 5n,
            typeId: '158',
        } as never);

        const ctx = await resolver.resolve({
            domain: 'x.bitrix24.ru',
            rpaName: 'supply',
        });

        expect(ctx.rpaTypeId).toBe(158);
        expect(ctx.rpaDbId).toBe(5n);
        expect(ctx.bxCtx).toEqual({
            moduleId: 'rpa',
            bitrixEntityId: 'RPA_158',
            bxFieldNamePrefix: 'UF_RPA_158_',
        });
        expect(ctx.owner).toEqual({
            entityType: PbxEntityType.BTX_RPA,
            entityDbId: 5,
            parentType: 'rpa',
        });
    });

    it('бросает 404, если портал не найден', async () => {
        portalService.getPortalByDomain.mockResolvedValue(null as never);
        await expect(
            resolver.resolve({ domain: 'x.bitrix24.ru', rpaName: 'supply' }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('бросает 404, если RPA не найден', async () => {
        portalService.getPortalByDomain.mockResolvedValue({ id: 1 } as never);
        portalRpaService.findFirstByPortalAndCode.mockResolvedValue(
            null as never,
        );
        await expect(
            resolver.resolve({ domain: 'x.bitrix24.ru', rpaName: 'supply' }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
