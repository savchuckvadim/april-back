import { ForbiddenException } from '@nestjs/common';
import { BitrixProxyService } from '../bitrix-proxy.service';

describe('BitrixProxyService', () => {
    const makeService = (callResult: unknown = { result: 'ok' }) => {
        const call = jest.fn().mockResolvedValue(callResult);
        const init = jest.fn().mockResolvedValue({ bitrix: { api: { call } } });
        const service = new BitrixProxyService({ init } as never);

        return { service, init, call };
    };

    it('инициализирует bitrix по домену и вызывает переданный метод с параметрами', async () => {
        const { service, init, call } = makeService({ result: { ID: '1' } });

        const result = await service.call(
            'example.bitrix24.ru',
            'crm.deal.get',
            { id: 1 },
        );

        expect(init).toHaveBeenCalledWith('example.bitrix24.ru');
        expect(call).toHaveBeenCalledWith('crm.deal.get', { id: 1 });
        expect(result).toEqual({ result: { ID: '1' } });
    });

    it('без params вызывает метод с пустым объектом параметров', async () => {
        const { service, call } = makeService();

        await service.call('example.bitrix24.ru', 'user.current');

        expect(call).toHaveBeenCalledWith('user.current', {});
    });

    it('ключ без ограничений (allowedDomains=null) проходит на любой домен', async () => {
        const { service, call } = makeService();

        await service.call('any.bitrix24.ru', 'user.current', {}, null);

        expect(call).toHaveBeenCalledWith('user.current', {});
    });

    it('разрешённый домен из изоляции ключа проходит (без учёта регистра)', async () => {
        const { service, call } = makeService();

        await service.call('GSR.Bitrix24.ru', 'user.current', {}, [
            'gsr.bitrix24.ru',
        ]);

        expect(call).toHaveBeenCalled();
    });

    it('домен вне изоляции ключа отклоняется ForbiddenException до вызова bitrix', async () => {
        const { service, init } = makeService();

        await expect(
            service.call('other.bitrix24.ru', 'crm.deal.get', {}, [
                'gsr.bitrix24.ru',
            ]),
        ).rejects.toThrow(ForbiddenException);
        expect(init).not.toHaveBeenCalled();
    });

    it('пробрасывает ошибку init (портал не найден)', async () => {
        const init = jest.fn().mockRejectedValue(new Error('portal not found'));
        const service = new BitrixProxyService({ init } as never);

        await expect(
            service.call('unknown.bitrix24.ru', 'crm.deal.get'),
        ).rejects.toThrow('portal not found');
    });

    it('пробрасывает ошибку вызова Bitrix', async () => {
        const call = jest.fn().mockRejectedValue(new Error('Method not found'));
        const init = jest.fn().mockResolvedValue({ bitrix: { api: { call } } });
        const service = new BitrixProxyService({ init } as never);

        await expect(
            service.call('example.bitrix24.ru', 'crm.unknown.method'),
        ).rejects.toThrow('Method not found');
    });
});
