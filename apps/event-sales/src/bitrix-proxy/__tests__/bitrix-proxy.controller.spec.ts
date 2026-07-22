import { BitrixProxyController } from '../bitrix-proxy.controller';
import { AgentRequest } from '../../agent-gate/guards/agent-key.guard';
import { BitrixProxyCallDto } from '../dto/bitrix-proxy.dto';

describe('BitrixProxyController', () => {
    const makeController = (callResult: unknown = { result: 'ok' }) => {
        const call = jest.fn().mockResolvedValue(callResult);
        const controller = new BitrixProxyController({ call } as never);

        return { controller, call };
    };

    const makeRequest = (agentDomains: string[] | null): AgentRequest =>
        ({ agentName: 'claw-test', agentDomains }) as AgentRequest;

    it('передаёт домен, метод, параметры и изоляцию ключа в сервис и оборачивает ответ', async () => {
        const { controller, call } = makeController({ result: [{ ID: '1' }] });
        const dto: BitrixProxyCallDto = {
            method: 'crm.deal.list',
            params: { filter: { STAGE_ID: 'NEW' } },
        };

        const response = await controller.call(
            'example.bitrix24.ru',
            dto,
            makeRequest(['example.bitrix24.ru']),
        );

        expect(call).toHaveBeenCalledWith(
            'example.bitrix24.ru',
            'crm.deal.list',
            { filter: { STAGE_ID: 'NEW' } },
            ['example.bitrix24.ru'],
        );
        expect(response).toEqual({
            domain: 'example.bitrix24.ru',
            method: 'crm.deal.list',
            result: { result: [{ ID: '1' }] },
        });
    });

    it('работает без params и с ключом без ограничений (agentDomains=null)', async () => {
        const { controller, call } = makeController();
        const dto: BitrixProxyCallDto = { method: 'user.current' };

        const response = await controller.call(
            'example.bitrix24.ru',
            dto,
            makeRequest(null),
        );

        expect(call).toHaveBeenCalledWith(
            'example.bitrix24.ru',
            'user.current',
            undefined,
            null,
        );
        expect(response.method).toBe('user.current');
    });
});
