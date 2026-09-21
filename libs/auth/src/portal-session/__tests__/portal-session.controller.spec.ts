import { UnauthorizedException } from '@nestjs/common';
import { PortalSessionController } from '../portal-session.controller';
import { PortalSessionService } from '../portal-session.service';
import { PortalSessionOpenResult } from '../portal-session.types';

const makeController = (result: PortalSessionOpenResult) => {
    const open = jest.fn().mockResolvedValue(result);
    const controller = new PortalSessionController({
        open,
    } as unknown as PortalSessionService);
    return { controller, open };
};

describe('PortalSessionController', () => {
    it('успешный обмен → сессия как есть, DTO передан сервису без изменений', async () => {
        const session = {
            token: 'jwt',
            expiresAt: '2026-09-22T02:00:00.000Z',
            domain: 'april.bitrix24.ru',
            user: { id: '447', name: null, lastName: null, isAdmin: false },
        };
        const { controller, open } = makeController({ ok: true, session });
        const dto = {
            domain: 'april.bitrix24.ru',
            accessToken: 'auth-id',
            memberId: 'm',
        };

        await expect(controller.open(dto)).resolves.toEqual(session);
        expect(open).toHaveBeenCalledWith(dto);
    });

    it('отказ сервиса → 401 с его текстом', async () => {
        const { controller } = makeController({
            ok: false,
            reason: 'rest_verify_failed',
            message: 'Битрикс24 не подтвердил токен',
        });

        await expect(
            controller.open({ domain: 'april.bitrix24.ru', accessToken: 'x' }),
        ).rejects.toThrow(
            new UnauthorizedException('Битрикс24 не подтвердил токен'),
        );
    });
});
