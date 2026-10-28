import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { findMissingModuleDependencies } from '@lib/core/testing/module-di';
import {
    SupportTelegramBotService,
    SupportTelegramNotifier,
} from '@lib/support';
import {
    secretsEqual,
    SupportTelegramWebhookGuard,
} from '../guards/support-telegram-webhook.guard';
import { SupportTelegramAppModule } from '../support-telegram-app.module';
import { SupportTelegramController } from '../support-telegram.controller';
import { SupportTelegramWebhookRegistrar } from '../support-telegram-webhook.registrar';

const contextWith = (headers: Record<string, string | string[]>) =>
    ({
        switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    }) as unknown as ExecutionContext;

const configOf = (env: Record<string, string | undefined>) =>
    ({ get: (key: string) => env[key] }) as unknown as ConfigService;

describe('SupportTelegramWebhookGuard', () => {
    const guard = new SupportTelegramWebhookGuard(
        configOf({ SUPPORT_TELEGRAM_WEBHOOK_SECRET: 's3cret' }),
    );

    it('секрет не задан — вебхук закрыт', () => {
        const closed = new SupportTelegramWebhookGuard(configOf({}));
        expect(() =>
            closed.canActivate(
                contextWith({ 'x-telegram-bot-api-secret-token': 's3cret' }),
            ),
        ).toThrow(UnauthorizedException);
    });

    it('без заголовка или с чужим секретом — 401; верный — пропуск', () => {
        expect(() => guard.canActivate(contextWith({}))).toThrow(
            UnauthorizedException,
        );
        expect(() =>
            guard.canActivate(
                contextWith({ 'x-telegram-bot-api-secret-token': 'nope' }),
            ),
        ).toThrow(UnauthorizedException);
        expect(
            guard.canActivate(
                contextWith({ 'x-telegram-bot-api-secret-token': 's3cret' }),
            ),
        ).toBe(true);
        expect(
            guard.canActivate(
                contextWith({ 'x-telegram-bot-api-secret-token': ['s3cret'] }),
            ),
        ).toBe(true);
    });

    it('сравнение секретов не зависит от длины', () => {
        expect(secretsEqual('abc', 'abc')).toBe(true);
        expect(secretsEqual('abc', 'abcd')).toBe(false);
        expect(secretsEqual('', 'a')).toBe(false);
    });
});

describe('SupportTelegramController', () => {
    it('отвечает сразу, обработку запускает в фоне', () => {
        const bot = { handle: jest.fn().mockResolvedValue(undefined) };
        const controller = new SupportTelegramController(
            bot as unknown as SupportTelegramBotService,
        );
        const update = {
            update_id: 5,
            message: { message_id: 1, chat: { id: -1 }, text: '/help' },
        };
        expect(controller.webhook(update)).toEqual({ accepted: true });
        expect(bot.handle).toHaveBeenCalledWith(update);
    });
});

describe('SupportTelegramWebhookRegistrar', () => {
    const originalRole = process.env.APP_ROLE;
    afterEach(() => {
        if (originalRole === undefined) delete process.env.APP_ROLE;
        else process.env.APP_ROLE = originalRole;
    });

    function setup(env: Record<string, string | undefined>, configured = true) {
        const telegram = {
            isConfigured: jest.fn().mockReturnValue(configured),
            setWebhook: jest.fn().mockResolvedValue(undefined),
        };
        const registrar = new SupportTelegramWebhookRegistrar(
            configOf(env),
            telegram as unknown as SupportTelegramNotifier,
        );
        return { registrar, telegram };
    }

    const ENV = {
        SUPPORT_TELEGRAM_WEBHOOK_URL:
            'https://api.bot.april-app.ru/api/support/telegram/webhook',
        SUPPORT_TELEGRAM_WEBHOOK_SECRET: 's3cret',
    };

    it('адрес и секрет заданы — вебхук регистрируется', async () => {
        delete process.env.APP_ROLE;
        const { registrar, telegram } = setup(ENV);
        await registrar.register();
        expect(telegram.setWebhook).toHaveBeenCalledWith(
            ENV.SUPPORT_TELEGRAM_WEBHOOK_URL,
            's3cret',
        );
    });

    it('зеркало, бот не настроен или нет адреса — не регистрируем', async () => {
        process.env.APP_ROLE = 'standby';
        const standby = setup(ENV);
        await standby.registrar.register();
        expect(standby.telegram.setWebhook).not.toHaveBeenCalled();

        delete process.env.APP_ROLE;
        const unconfigured = setup(ENV, false);
        await unconfigured.registrar.register();
        expect(unconfigured.telegram.setWebhook).not.toHaveBeenCalled();

        const noUrl = setup({ SUPPORT_TELEGRAM_WEBHOOK_SECRET: 's' });
        await noUrl.registrar.register();
        expect(noUrl.telegram.setWebhook).not.toHaveBeenCalled();
    });

    it('ошибка Telegram не роняет старт', async () => {
        delete process.env.APP_ROLE;
        const { registrar, telegram } = setup(ENV);
        telegram.setWebhook.mockRejectedValueOnce(new Error('401'));
        await expect(registrar.register()).resolves.toBeUndefined();
    });
});

describe('DI-граф Telegram-входа', () => {
    it('SupportTelegramAppModule: контроллер, охрана и регистратор получают зависимости', () => {
        expect(findMissingModuleDependencies(SupportTelegramAppModule)).toEqual(
            [],
        );
    });
});
