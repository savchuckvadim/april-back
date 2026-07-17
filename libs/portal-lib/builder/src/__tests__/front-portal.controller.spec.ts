import { NotFoundException } from '@nestjs/common';
import { FrontPortalController } from '../controllers/front-portal.controller';
import { FrontPortalBuilderService } from '../services/front-portal-builder.service';
import { FrontPortalDto } from '../dto/front-portal.dto';

describe('FrontPortalController', () => {
    const portalStub = { id: 1 } as FrontPortalDto;

    const createController = (
        buildByDomain: jest.Mock,
    ): FrontPortalController =>
        new FrontPortalController({
            buildByDomain,
        } as unknown as FrontPortalBuilderService);

    it('возвращает { portal } — глобальный интерцептор обернёт в {resultCode, data}', async () => {
        const buildByDomain = jest.fn().mockResolvedValue(portalStub);
        const controller = createController(buildByDomain);

        const response = await controller.getPortal({
            domain: 'test.bitrix24.ru',
        });

        expect(buildByDomain).toHaveBeenCalledWith('test.bitrix24.ru');
        expect(response).toEqual({ portal: portalStub });
    });

    it('пробрасывает ошибку сервиса (404 отдаст GlobalExceptionFilter)', async () => {
        const controller = createController(
            jest.fn().mockRejectedValue(new NotFoundException()),
        );

        await expect(
            controller.getPortal({ domain: 'unknown.bitrix24.ru' }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
