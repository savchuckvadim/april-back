import { BadRequestException } from '@nestjs/common';
import {
    DEFAULT_BADGES,
    PortalBadgesService,
} from '@lib/portal-lib/store/badges';
import { BadgesController } from '../badges.controller';

/*
 * Read-эндпоинт фрейма: портал без своего набора получает общий (не 404 и
 * не пусто), домен обязателен, версия совпадает с полным ответом.
 */
const makeService = () => {
    const payload = {
        contract: 1,
        mode: 'default',
        version: 0,
        hash: 'abc',
        items: [...DEFAULT_BADGES],
    };
    // Моки — отдельными константами, чтобы проверять вызовы по ним, а не
    // по методам класса (unbound-method).
    const resolve = jest.fn().mockResolvedValue(payload);
    const getVersion = jest.fn().mockResolvedValue({ version: 0, hash: 'abc' });
    const service = { resolve, getVersion } as unknown as PortalBadgesService;
    return { service, resolve, getVersion };
};

describe('BadgesController', () => {
    it('отдаёт общий набор портала без документа', async () => {
        const { service, resolve } = makeService();
        const controller = new BadgesController(service);

        const catalog = await controller.resolve('gsr.bitrix24.ru');

        expect(catalog.items).toHaveLength(DEFAULT_BADGES.length);
        expect(resolve).toHaveBeenCalledWith('gsr.bitrix24.ru');
    });

    it('обрезает пробелы домена', async () => {
        const { service, getVersion } = makeService();
        const controller = new BadgesController(service);

        await controller.version('  gsr.bitrix24.ru ');

        expect(getVersion).toHaveBeenCalledWith('gsr.bitrix24.ru');
    });

    it.each(['', '   ', undefined])('без домена — 400 (%p)', async domain => {
        const controller = new BadgesController(makeService().service);

        await expect(
            controller.resolve(domain as string),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
