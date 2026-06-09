import { NotFoundException } from '@nestjs/common';
import { PbxDepartamentInstallUseCase } from './pbx-departament-install.use-case';
import { PbxDepartamentGroupEnum } from '@lib/portal-lib/pbx/app-type';

describe('PbxDepartamentInstallUseCase', () => {
    let portalService: { getPortalByDomain: jest.Mock };
    let portalDepartamentService: {
        upsertByKey: jest.Mock;
        update: jest.Mock;
        delete: jest.Mock;
    };
    let useCase: PbxDepartamentInstallUseCase;

    beforeEach(() => {
        portalService = {
            getPortalByDomain: jest.fn().mockResolvedValue({ id: 1 }),
        };
        portalDepartamentService = {
            upsertByKey: jest.fn().mockResolvedValue({ id: 1 }),
            update: jest.fn(),
            delete: jest.fn(),
        };
        useCase = new PbxDepartamentInstallUseCase(
            portalService as never,
            portalDepartamentService as never,
        );
    });

    it('делает upsert в БД с bitrixId из запроса, в Bitrix не пишет', async () => {
        const res = await useCase.installDepartament(
            'test.bitrix24.ru',
            PbxDepartamentGroupEnum.sales,
            5,
        );

        expect(portalDepartamentService.upsertByKey).toHaveBeenCalledWith(
            1,
            PbxDepartamentGroupEnum.sales,
            { name: 'Отдел продаж', title: 'Отдел продаж', bitrixId: 5 },
        );
        expect(res.portalResult).toEqual({ id: 1 });
    });

    it('берёт фиксированные name/title для service', async () => {
        await useCase.installDepartament(
            'test.bitrix24.ru',
            PbxDepartamentGroupEnum.service,
            7,
        );

        expect(portalDepartamentService.upsertByKey).toHaveBeenCalledWith(
            1,
            PbxDepartamentGroupEnum.service,
            { name: 'Отдел сервиса', title: 'Отдел сервиса', bitrixId: 7 },
        );
    });

    it('кидает NotFound, если портал не найден', async () => {
        portalService.getPortalByDomain.mockResolvedValue(null);
        await expect(
            useCase.installDepartament('x', PbxDepartamentGroupEnum.sales, 5),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('delete делегирует в portalDepartamentService', async () => {
        await useCase.delete(10);
        expect(portalDepartamentService.delete).toHaveBeenCalledWith(10);
    });
});
