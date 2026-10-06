import { Logger } from '@nestjs/common';
import {
    EnumPortalAppCode,
    PortalAppSettingsResolved,
    PortalAppSettingsService,
    getPortalAppDefaults,
} from '@lib/portal-lib/store/app-settings';
import { toBitrixRateLimitOverrides } from '../lib/bitrix-rate-limit.settings';
import { PortalRateLimitResolver } from '../lib/portal-rate-limit.resolver';

/**
 * Лимит запросов к Битриксу — из «Общих настроек портала». Применяется
 * только заданное на портале: незаданное остаётся за ограничителем.
 */
type PortalSettings = PortalAppSettingsResolved<EnumPortalAppCode.portal>;

const resolvedOf = (
    values: Partial<PortalSettings['values']>,
    storedKeys: string[] = Object.keys(values),
): PortalSettings => ({
    values: { ...getPortalAppDefaults(EnumPortalAppCode.portal), ...values },
    storedKeys,
});

describe('toBitrixRateLimitOverrides', () => {
    it('на портале ничего не задано — пусто: действуют значения ограничителя', () => {
        expect(toBitrixRateLimitOverrides(resolvedOf({}, []))).toEqual({});
    });

    it('заданное — в единицах ограничителя: доля 0..1, ожидание в мс', () => {
        expect(
            toBitrixRateLimitOverrides(
                resolvedOf({
                    bitrixRatePlan: 'enterprise',
                    bitrixBackgroundSharePercent: 40,
                    bitrixInteractiveMaxWaitSec: 20,
                    bitrixBackgroundMaxWaitSec: 300,
                }),
            ),
        ).toEqual({
            plan: 'enterprise',
            backgroundShare: 0.4,
            interactiveMaxWaitMs: 20_000,
            backgroundMaxWaitMs: 300_000,
        });
    });

    it('неизвестный тариф (старое «как на сервере») не передаётся', () => {
        expect(
            toBitrixRateLimitOverrides(
                resolvedOf({ bitrixRatePlan: 'server' }),
            ),
        ).toEqual({});
    });

    it('очередь выключена на портале — ограничитель это узнаёт', () => {
        expect(
            toBitrixRateLimitOverrides(
                resolvedOf({ bitrixRateLimitEnabled: false }),
            ),
        ).toEqual({ enabled: false });
        expect(
            toBitrixRateLimitOverrides(
                resolvedOf({ bitrixRateLimitEnabled: true }),
            ),
        ).toEqual({ enabled: true });
    });

    it('доля меньше 10% поднимается до 10, больше 100% — не передаётся', () => {
        expect(
            toBitrixRateLimitOverrides(
                resolvedOf({ bitrixBackgroundSharePercent: 3 }),
            ),
        ).toEqual({ backgroundShare: 0.1 });
        expect(
            toBitrixRateLimitOverrides(
                resolvedOf({ bitrixBackgroundSharePercent: 150 }),
            ),
        ).toEqual({});
    });
});

describe('PortalRateLimitResolver', () => {
    const logger = { warn: jest.fn() } as unknown as Logger;

    it('настройки читаются раз в минуту, а не на каждый init', async () => {
        const resolveWithStored = jest
            .fn()
            .mockResolvedValue(resolvedOf({ bitrixRatePlan: 'enterprise' }));
        const resolver = new PortalRateLimitResolver(
            { resolveWithStored } as unknown as PortalAppSettingsService,
            logger,
        );

        await resolver.resolve('a.bitrix24.ru');
        const second = await resolver.resolve('a.bitrix24.ru');

        expect(second).toEqual({ plan: 'enterprise' });
        expect(resolveWithStored).toHaveBeenCalledTimes(1);
        expect(resolveWithStored).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            EnumPortalAppCode.portal,
        );
    });

    it('настройки не прочитались — значения по умолчанию, init не падает', async () => {
        const resolver = new PortalRateLimitResolver(
            {
                resolveWithStored: jest
                    .fn()
                    .mockRejectedValue(new Error('db down')),
            } as unknown as PortalAppSettingsService,
            logger,
        );

        await expect(
            resolver.resolve('a.bitrix24.ru'),
        ).resolves.toBeUndefined();
    });

    it('без сервиса настроек — значения по умолчанию', async () => {
        const resolver = new PortalRateLimitResolver(undefined, logger);

        await expect(
            resolver.resolve('a.bitrix24.ru'),
        ).resolves.toBeUndefined();
    });
});
