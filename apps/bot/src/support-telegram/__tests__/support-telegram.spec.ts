import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { findMissingModuleDependencies } from '@lib/core/testing/module-di';
import {
    SupportTelegramBotService,
    SupportTelegramNotifier,
} from '@lib/support';
import { SupportTelegramWebhookGuard } from '../guards/support-telegram-webhook.guard';
import { SupportTelegramAppModule } from '../support-telegram-app.module';
import { SupportTelegramController } from '../support-telegram.controller';
import { SupportTelegramWebhookRegistrar } from '../support-telegram-webhook.registrar';

const contextWith = (headers: Record<string, string | string[]>) =>
    ({
        switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    }) as unknown as ExecutionContext;

const configOf = (env: Record<string, string | undefined>) =>
    ({ get: (key: string) => env[key] }) as unknown as ConfigService;

const notifierWithSecret = (secret: string | null) =>
    ({
        webhookSecret: () => Promise.resolve(secret),
    }) as unknown as SupportTelegramNotifier;

describe('SupportTelegramWebhookGuard', () => {
    const guard = new SupportTelegramWebhookGuard(notifierWithSecret('s3cret'));

    it('токена нет — вебхук закрыт', async () => {
        const closed = new SupportTelegramWebhookGuard(
            notifierWithSecret(null),
        );
        await expect(
            closed.canActivate(
                contextWith({ 'x-telegram-bot-api-secret-token': 's3cret' }),
            ),
        ).rejects.toThrow('Вебхук Telegram-бота поддержки не настроен');
    });

    it('без заголовка или с чужим секретом — 401; верный — пропуск', async () => {
        await expect(guard.canActivate(contextWith({}))).rejects.toThrow(
            UnauthorizedException,
        );
        await expect(
            guard.canActivate(
                contextWith({ 'x-telegram-bot-api-secret-token': 'nope' }),
            ),
        ).rejects.toThrow(UnauthorizedException);
        await expect(
            guard.canActivate(
                contextWith({ 'x-telegram-bot-api-secret-token': 's3cret' }),
            ),
        ).resolves.toBe(true);
        await expect(
            guard.canActivate(
                contextWith({ 'x-telegram-bot-api-secret-token': ['s3cret'] }),
            ),
        ).resolves.toBe(true);
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
    const URL = 'https://api.bot.april-app.ru/api/support/telegram/webhook';

    function setup(url: string | undefined, secret: string | null = 'sec-1') {
        const telegram = {
            webhookSecret: jest.fn().mockResolvedValue(secret),
            setWebhook: jest.fn().mockResolvedValue(undefined),
        };
        const registrar = new SupportTelegramWebhookRegistrar(
            configOf({ SUPPORT_TELEGRAM_WEBHOOK_URL: url }),
            telegram as unknown as SupportTelegramNotifier,
        );
        return { registrar, telegram };
    }

    it('адрес и токен есть — вебхук с секретом токена; токен сменился — заново', async () => {
        const { registrar, telegram } = setup(URL);
        await registrar.sync();
        await registrar.sync();
        expect(telegram.setWebhook).toHaveBeenCalledTimes(1);
        expect(telegram.setWebhook).toHaveBeenCalledWith(URL, 'sec-1');

        telegram.webhookSecret.mockResolvedValue('sec-2');
        await registrar.sync();
        expect(telegram.setWebhook).toHaveBeenLastCalledWith(URL, 'sec-2');
    });

    it('бот не настроен или нет адреса — не регистрируем', async () => {
        const unconfigured = setup(URL, null);
        await unconfigured.registrar.sync();
        expect(unconfigured.telegram.setWebhook).not.toHaveBeenCalled();

        const noUrl = setup(undefined);
        await noUrl.registrar.sync();
        expect(noUrl.telegram.setWebhook).not.toHaveBeenCalled();
    });

    it('ошибка Telegram не роняет старт', async () => {
        const { registrar, telegram } = setup(URL);
        telegram.setWebhook.mockRejectedValueOnce(new Error('401'));
        await expect(registrar.sync()).resolves.toBeUndefined();
    });
});

describe('DI-граф Telegram-входа', () => {
    it('SupportTelegramAppModule: контроллер, охрана и регистратор получают зависимости', () => {
        expect(findMissingModuleDependencies(SupportTelegramAppModule)).toEqual(
            [],
        );
    });
});
