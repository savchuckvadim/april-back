import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BxSuperUserService } from '../services/bx-super-user.service';
import { BX_SUPER_USER_IDS_ENV } from '../lib/super-user.util';

/** ConfigService-заглушка: отдаёт только BX_SUPER_USER_IDS. */
const configWith = (value: string | undefined) => {
    const get = jest.fn((key: string) =>
        key === BX_SUPER_USER_IDS_ENV ? value : undefined,
    );
    return { config: { get } as unknown as ConfigService, get };
};

describe('BxSuperUserService', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => warn.mockRestore());

    it('читает BX_SUPER_USER_IDS один раз и узнаёт суперпользователя портала', () => {
        const { config, get } = configWith(
            'example.bitrix24.ru:123,other.bitrix24.ru:456',
        );
        const service = new BxSuperUserService(config);

        expect(service.isSuperUser('example.bitrix24.ru', 123)).toBe(true);
        expect(service.isSuperUser('OTHER.bitrix24.ru', 456)).toBe(true);
        expect(service.isSuperUser('other.bitrix24.ru', 123)).toBe(false);
        expect(service.isSuperUser('example.bitrix24.ru', 0)).toBe(false);
        expect(get).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenCalledWith(BX_SUPER_USER_IDS_ENV);
        expect(warn).not.toHaveBeenCalled();
    });

    it('переменная не задана — суперпользователей нет, без warn', () => {
        const service = new BxSuperUserService(configWith(undefined).config);

        expect(service.isSuperUser('example.bitrix24.ru', 123)).toBe(false);
        expect(warn).not.toHaveBeenCalled();
    });

    it('мусорные записи — один warn со списком, валидные работают', () => {
        const service = new BxSuperUserService(
            configWith('a.ru:447,oops,b.ru:x').config,
        );

        expect(service.isSuperUser('a.ru', 447)).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
        const [message] = warn.mock.calls[0] as [string];
        expect(message).toContain(BX_SUPER_USER_IDS_ENV);
        expect(message).toContain('oops, b.ru:x');
    });
});
