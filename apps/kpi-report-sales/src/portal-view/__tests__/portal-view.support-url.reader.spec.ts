import type { ConfigService } from '@nestjs/config';
import type { VendorSettingsReader } from '@lib/vendor-settings';
import { PortalViewSupportUrlReader } from '../portal-view.support-url.reader';
import { SUPPORT_URL } from './portal-view.fixtures';

const configOf = (env: Record<string, string | undefined>): ConfigService =>
    ({
        get: (key: string) => env[key],
    }) as unknown as ConfigService;

const readerOf = (
    get: (key: string) => Promise<string | null>,
): VendorSettingsReader => ({
    get,
    getMany: jest.fn(),
});

describe('PortalViewSupportUrlReader', () => {
    it('читает настройку SUPPORT_CHAT_URL из настроек вендора', async () => {
        const get = jest.fn().mockResolvedValue(SUPPORT_URL);
        const reader = new PortalViewSupportUrlReader(
            configOf({}),
            readerOf(get),
        );

        expect(await reader.read()).toBe(SUPPORT_URL);
        expect(get).toHaveBeenCalledWith('SUPPORT_CHAT_URL');
    });

    it('не задана — null: кнопки поддержки нет', async () => {
        const reader = new PortalViewSupportUrlReader(
            configOf({}),
            readerOf(() => Promise.resolve(null)),
        );

        expect(await reader.read()).toBeNull();
    });

    it('значение не адрес — null', async () => {
        for (const bad of [
            'чат',
            'ftp://chat.ru',
            'javascript:alert(1)',
            '  ',
        ]) {
            const reader = new PortalViewSupportUrlReader(
                configOf({}),
                readerOf(() => Promise.resolve(bad)),
            );
            expect(await reader.read()).toBeNull();
        }
    });

    it('чтение настроек упало — null, отчёт не ломается', async () => {
        const reader = new PortalViewSupportUrlReader(
            configOf({}),
            readerOf(() => Promise.reject(new Error('база недоступна'))),
        );

        expect(await reader.read()).toBeNull();
    });

    it('читателя настроек в приложении нет — значение берётся из окружения', async () => {
        const reader = new PortalViewSupportUrlReader(
            configOf({ SUPPORT_CHAT_URL: SUPPORT_URL }),
        );

        expect(await reader.read()).toBe(SUPPORT_URL);
        expect(
            await new PortalViewSupportUrlReader(configOf({})).read(),
        ).toBeNull();
    });
});
