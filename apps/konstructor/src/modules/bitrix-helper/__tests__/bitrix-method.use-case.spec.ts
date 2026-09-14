import { BadGatewayException } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import { BitrixMethodUseCase } from '../use-cases/bitrix-method.use-case';
import { BitrixMethodDto } from '../dto/bitrix-method.dto';

/**
 * Прокси REST-вызова для dev-режима легаси-фронта: фронт ждёт в result
 * ровно то, что в проде отдаёт `BX24.callMethod(...).answer.result`.
 */
describe('BitrixMethodUseCase', () => {
    const build = (bitrixBody: unknown) => {
        const call = jest.fn().mockResolvedValue(bitrixBody);
        const init = jest.fn().mockResolvedValue({ bitrix: { api: { call } } });
        const pbx = { init } as unknown as PBXService;
        return { useCase: new BitrixMethodUseCase(pbx), call, init };
    };

    const dto = (over: Partial<BitrixMethodDto> = {}): BitrixMethodDto => ({
        domain: 'gsr.bitrix24.ru',
        method: 'crm.deal.get',
        bxData: { id: 100 },
        ...over,
    });

    it('инициализирует bitrix по домену из dto и зовёт метод с bxData как есть', async () => {
        const { useCase, call, init } = build({ result: { ID: '100' } });

        await useCase.execute(dto());

        expect(init).toHaveBeenCalledWith('gsr.bitrix24.ru');
        expect(call).toHaveBeenCalledWith('crm.deal.get', { id: 100 });
    });

    it('в result отдаёт только поле result ответа Bitrix — без time/next/total', async () => {
        const { useCase } = build({
            result: [{ ID: '1' }, { ID: '2' }],
            next: 50,
            total: 120,
            time: { start: 1 },
        });

        const response = await useCase.execute(
            dto({ method: 'crm.deal.list' }),
        );

        expect(response).toEqual({ result: [{ ID: '1' }, { ID: '2' }] });
    });

    it('ложный result (false у update) — это ответ Bitrix, а не ошибка', async () => {
        const { useCase } = build({ result: false });

        const response = await useCase.execute(
            dto({ method: 'crm.deal.update' }),
        );

        expect(response).toEqual({ result: false });
    });

    it('тело без result — BadGatewayException, а не молчаливый undefined', async () => {
        const { useCase } = build({ error: 'ERROR_METHOD_NOT_FOUND' });

        await expect(useCase.execute(dto())).rejects.toThrow(
            BadGatewayException,
        );
    });

    it('ошибка инициализации портала пробрасывается наверх', async () => {
        const init = jest.fn().mockRejectedValue(new Error('portal not found'));
        const pbx = { init } as unknown as PBXService;
        const useCase = new BitrixMethodUseCase(pbx);

        await expect(useCase.execute(dto())).rejects.toThrow(
            'portal not found',
        );
    });
});
