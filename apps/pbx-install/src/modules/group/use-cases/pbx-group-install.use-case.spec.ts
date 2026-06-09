import { NotFoundException } from '@nestjs/common';
import { PbxGroupInstallUseCase } from './pbx-group-install.use-case';
import { PbxCallingGroupEnum } from '@lib/portal-lib/pbx/app-type';

describe('PbxGroupInstallUseCase', () => {
    let sonetGroup: {
        get: jest.Mock;
        add: jest.Mock;
        update: jest.Mock;
    };
    let pbxService: { init: jest.Mock };
    let portalService: { getPortalByDomain: jest.Mock };
    let portalCallingService: { upsertByKey: jest.Mock };
    let useCase: PbxGroupInstallUseCase;

    beforeEach(() => {
        sonetGroup = {
            get: jest.fn(),
            add: jest.fn(),
            update: jest.fn(),
        };
        pbxService = {
            init: jest.fn().mockResolvedValue({ bitrix: { sonetGroup } }),
        };
        portalService = {
            getPortalByDomain: jest.fn().mockResolvedValue({ id: 1 }),
        };
        portalCallingService = {
            upsertByKey: jest.fn().mockResolvedValue({ id: 1 }),
        };
        useCase = new PbxGroupInstallUseCase(
            pbxService as never,
            portalService as never,
            portalCallingService as never,
        );
    });

    it('создаёт группу в Bitrix, если её нет, и делает upsert в БД', async () => {
        sonetGroup.get.mockResolvedValue({ result: [] });
        sonetGroup.add.mockResolvedValue({ result: 77 });

        const res = await useCase.installGroup(
            'test.bitrix24.ru',
            PbxCallingGroupEnum.sales,
        );

        expect(sonetGroup.add).toHaveBeenCalledTimes(1);
        expect(sonetGroup.update).not.toHaveBeenCalled();
        expect(res.bxResult).toEqual({ bitrixId: 77, created: true });
        expect(portalCallingService.upsertByKey).toHaveBeenCalledWith(
            1,
            PbxCallingGroupEnum.sales,
            { name: 'ОП Звонки', title: 'ОП Звонки', bitrixId: 77 },
        );
    });

    it('обновляет группу в Bitrix, если она уже есть', async () => {
        sonetGroup.get.mockResolvedValue({ result: [{ ID: '5' }] });

        const res = await useCase.installGroup(
            'test.bitrix24.ru',
            PbxCallingGroupEnum.service,
        );

        expect(sonetGroup.update).toHaveBeenCalledWith(5, {
            NAME: 'ОС Звонки',
        });
        expect(sonetGroup.add).not.toHaveBeenCalled();
        expect(res.bxResult).toEqual({ bitrixId: 5, created: false });
        expect(portalCallingService.upsertByKey).toHaveBeenCalledWith(
            1,
            PbxCallingGroupEnum.service,
            { name: 'ОС Звонки', title: 'ОС Звонки', bitrixId: 5 },
        );
    });

    it('кидает NotFound, если портал не найден', async () => {
        portalService.getPortalByDomain.mockResolvedValue(null);
        await expect(
            useCase.installGroup('x', PbxCallingGroupEnum.sales),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
