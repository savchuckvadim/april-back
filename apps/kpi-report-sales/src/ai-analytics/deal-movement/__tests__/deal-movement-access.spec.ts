import { ForbiddenException } from '@nestjs/common';
import type { RequesterAccess } from '../../domain/access/perimeter.util';
import { DealMovementAccessService } from '../deal-movement-access.service';
import { dealMovementScopeOf } from '../deal-movement-scope';
import { CUP, MANAGER, OP } from './deal-movement.fixtures';

const build = (access: RequesterAccess, selfViewEnabled = false) => {
    const requester = { resolve: jest.fn().mockResolvedValue(access) };
    const settings = { load: jest.fn().mockResolvedValue({ selfViewEnabled }) };
    return {
        service: new DealMovementAccessService(
            requester as never,
            settings as never,
        ),
        settings,
    };
};

describe('права раздела «Движение сделок»', () => {
    it('руководитель — его периметр, настройки не читаются', async () => {
        const { service, settings } = build(OP);

        await expect(service.resolve('d.bitrix24.ru', '10')).resolves.toBe(OP);
        expect(settings.load).not.toHaveBeenCalled();
    });

    it('суперпользователь проходит при любой роли', async () => {
        const superUser: RequesterAccess = {
            role: 'manager',
            visibleManagerIds: ['1'],
            isSuperUser: true,
        };
        const { service } = build(superUser);

        await expect(service.resolve('d.bitrix24.ru', '1')).resolves.toBe(
            superUser,
        );
    });

    it('менеджер без самопросмотра — 403 «Раздел доступен руководителям»', async () => {
        const { service } = build(MANAGER);

        const error = await service
            .resolve('d.bitrix24.ru', '447')
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).toBe(
            'Раздел доступен руководителям',
        );
    });

    it('менеджер с самопросмотром — только свои', async () => {
        const { service } = build(MANAGER, true);

        const access = await service.resolve('d.bitrix24.ru', '447');
        const scope = dealMovementScopeOf(access, undefined);

        expect(scope.visible('447')).toBe(true);
        expect(scope.visible('512')).toBe(false);
        expect(scope.whole).toBe(false);
    });
});

describe('периметр и фильтр менеджеров', () => {
    it('видит всех без фильтра — итог портала, строки без менеджера видны', () => {
        const scope = dealMovementScopeOf(CUP, []);

        expect(scope.whole).toBe(true);
        expect(scope.visible(null)).toBe(true);
    });

    it('фильтр сужает периметр, чужие id ничего не добавляют', () => {
        const scope = dealMovementScopeOf(OP, ['512', '999']);

        expect(scope.whole).toBe(false);
        expect(scope.visible('512')).toBe(true);
        expect(scope.visible('447')).toBe(false);
        expect(scope.visible('999')).toBe(false);
        expect(scope.visible(null)).toBe(false);
    });
});
