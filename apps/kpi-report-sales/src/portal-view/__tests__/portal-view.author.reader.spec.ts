import { Logger } from '@nestjs/common';
import type { PBXService } from '@/modules/pbx';
import { PortalViewAuthorReader } from '../portal-view.author.reader';
import { DOMAIN } from './portal-view.fixtures';

function build(userGet: jest.Mock) {
    const pbx = {
        init: jest
            .fn()
            .mockResolvedValue({ bitrix: { user: { get: userGet } } }),
    };
    const reader = new PortalViewAuthorReader(pbx as unknown as PBXService);
    return { reader, pbx };
}

describe('PortalViewAuthorReader', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('«Фамилия Имя» из Битрикса; инстанс берётся на вызов у PBXService', async () => {
        const userGet = jest.fn().mockResolvedValue({
            result: [{ ID: '447', NAME: 'Пётр', LAST_NAME: 'Иванов' }],
        });
        const { reader, pbx } = build(userGet);

        expect(await reader.nameOf(DOMAIN, '447')).toBe('Иванов Пётр');
        expect(pbx.init).toHaveBeenCalledWith(DOMAIN);
        expect(userGet).toHaveBeenCalledWith({ '=ID': ['447'] }, [
            'ID',
            'NAME',
            'LAST_NAME',
        ]);
    });

    it('id с ведущими нулями находится по числовому значению', async () => {
        const userGet = jest.fn().mockResolvedValue({
            result: [{ ID: '447', NAME: 'Пётр', LAST_NAME: 'Иванов' }],
        });
        const { reader } = build(userGet);

        expect(await reader.nameOf(DOMAIN, '0447')).toBe('Иванов Пётр');
    });

    it('сотрудника в ответе нет — «Сотрудник № id»', async () => {
        const { reader } = build(jest.fn().mockResolvedValue({ result: [] }));

        expect(await reader.nameOf(DOMAIN, '447')).toBe('Сотрудник № 447');
    });

    it('у сотрудника пустые имя и фамилия — «Сотрудник № id»', async () => {
        const { reader } = build(
            jest.fn().mockResolvedValue({
                result: [{ ID: '447', NAME: ' ', LAST_NAME: '' }],
            }),
        );

        expect(await reader.nameOf(DOMAIN, '447')).toBe('Сотрудник № 447');
    });

    it('Битрикс не ответил — «Сотрудник № id», сохранение не падает', async () => {
        const { reader } = build(
            jest.fn().mockRejectedValue(new Error('ECONNRESET')),
        );

        expect(await reader.nameOf(DOMAIN, '447')).toBe('Сотрудник № 447');
    });

    it('портал не открылся — «Сотрудник № id»', async () => {
        const { reader, pbx } = build(jest.fn());
        pbx.init.mockRejectedValue(new Error('нет ключей доступа'));

        expect(await reader.nameOf(DOMAIN, '447')).toBe('Сотрудник № 447');
    });
});
