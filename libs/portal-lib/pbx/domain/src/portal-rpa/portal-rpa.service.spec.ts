import { PrismaService } from '@/core/prisma';
import { PbxFieldService } from '@lib/portal-lib/pbx-domain/field';
import { BtxCategoryRepository } from '@lib/portal-lib/pbx-domain/category';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { IBxRpaType } from '@/modules/bitrix';
import { PortalRpaService } from './portal-rpa.service';

const bxRpaType: IBxRpaType = {
    id: 158,
    title: 'Заявка на сервис',
    name: 'Заявка на сервис',
    createdBy: 1,
    image: 'tick',
};

describe('PortalRpaService.upsertFromBitrix', () => {
    let service: PortalRpaService;
    let prisma: {
        btx_rpas: {
            findFirst: jest.Mock;
            create: jest.Mock;
            update: jest.Mock;
        };
    };
    let portalService: jest.Mocked<
        Pick<PortalStoreService, 'getPortalByDomain'>
    >;

    beforeEach(() => {
        prisma = {
            btx_rpas: {
                findFirst: jest.fn(),
                create: jest.fn().mockResolvedValue({ id: 9n }),
                update: jest.fn().mockResolvedValue({ id: 7n }),
            },
        };
        portalService = { getPortalByDomain: jest.fn() };
        service = new PortalRpaService(
            prisma as unknown as PrismaService,
            {} as unknown as PbxFieldService,
            portalService as unknown as PortalStoreService,
            {} as unknown as BtxCategoryRepository,
        );
    });

    it('создаёт строку btx_rpas, если её нет (code = rpaName, type = group)', async () => {
        portalService.getPortalByDomain.mockResolvedValue({ id: 1 } as never);
        prisma.btx_rpas.findFirst.mockResolvedValue(null);

        await service.upsertFromBitrix(
            'x.bitrix24.ru',
            bxRpaType,
            'supply',
            'general',
        );

        expect(prisma.btx_rpas.create).toHaveBeenCalledTimes(1);
        const createCalls = prisma.btx_rpas.create.mock.calls as Array<
            [
                {
                    data: {
                        code: string;
                        type: string;
                        typeId: string;
                        bitrixId: bigint;
                        portal_id: bigint;
                    };
                },
            ]
        >;
        const data = createCalls[0][0].data;
        expect(data.code).toBe('supply');
        expect(data.type).toBe('general');
        expect(data.typeId).toBe('158');
        expect(data.bitrixId).toBe(158n);
        expect(data.portal_id).toBe(1n);
    });

    it('обновляет строку btx_rpas, если она уже есть', async () => {
        portalService.getPortalByDomain.mockResolvedValue({ id: 1 } as never);
        prisma.btx_rpas.findFirst.mockResolvedValue({ id: 7n });

        await service.upsertFromBitrix(
            'x.bitrix24.ru',
            bxRpaType,
            'supply',
            'general',
        );

        expect(prisma.btx_rpas.update).toHaveBeenCalledTimes(1);
        const updateCalls = prisma.btx_rpas.update.mock.calls as Array<
            [{ where: { id: bigint } }]
        >;
        expect(updateCalls[0][0].where).toEqual({ id: 7n });
        expect(prisma.btx_rpas.create).not.toHaveBeenCalled();
    });
});
