import { NotFoundException } from '@nestjs/common';
import { PbxUserEntityService } from './pbx-user-entity.service';

describe('PbxUserEntityService', () => {
    let portalService: { getPortalByDomain: jest.Mock };
    let pbxUserService: { findByPortalId: jest.Mock; create: jest.Mock };
    let service: PbxUserEntityService;

    beforeEach(() => {
        portalService = {
            getPortalByDomain: jest.fn().mockResolvedValue({ id: 7 }),
        };
        pbxUserService = {
            findByPortalId: jest.fn(),
            create: jest.fn(),
        };
        service = new PbxUserEntityService(
            portalService as never,
            pbxUserService as never,
        );
    });

    it('возвращает userId существующей записи', async () => {
        pbxUserService.findByPortalId.mockResolvedValue({ id: '42' });
        const res = await service.getOrCreateUserId('test.bitrix24.ru');
        expect(res).toEqual({ portalId: 7, userId: 42 });
        expect(pbxUserService.create).not.toHaveBeenCalled();
    });

    it('создаёт user, если его нет (NotFound)', async () => {
        pbxUserService.findByPortalId.mockRejectedValue(
            new NotFoundException('User not found'),
        );
        pbxUserService.create.mockResolvedValue({ id: '99' });

        const res = await service.getOrCreateUserId('test.bitrix24.ru');

        expect(pbxUserService.create).toHaveBeenCalledWith(
            'user_test.bitrix24.ru',
            '7',
        );
        expect(res).toEqual({ portalId: 7, userId: 99 });
    });

    it('findUserId возвращает null, если user не найден', async () => {
        pbxUserService.findByPortalId.mockRejectedValue(
            new NotFoundException('User not found'),
        );
        const res = await service.findUserId('test.bitrix24.ru');
        expect(res).toBeNull();
    });

    it('getPortalId кидает NotFound, если портал не найден', async () => {
        portalService.getPortalByDomain.mockResolvedValue(null);
        await expect(
            service.getOrCreateUserId('x.bitrix24.ru'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
