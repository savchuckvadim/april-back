import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { APP_ROLE_ENV } from '@lib/core/bootstrap/app-role';
import { TELEGRAM_SECRET_HEADER } from '@lib/telegram';
import { CabinetConfig } from '../../../config/cabinet.config';
import { ClientTelegramBotClient } from '../../client-telegram-bot.client';
import { ClientTelegramWebhookGuard } from '../client-telegram-webhook.guard';
import { ClientTelegramWebhookRegistrar } from '../client-telegram-webhook.registrar';

const URL = 'https://api.bot.april-app.ru/api/cabinet/telegram/webhook';

function contextWith(secret?: string): ExecutionContext {
    const headers = secret ? { [TELEGRAM_SECRET_HEADER]: secret } : {};
    return {
        switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext;
}

describe('ClientTelegramWebhookGuard', () => {
    let secret: string | null;
    let guard: ClientTelegramWebhookGuard;

    beforeEach(() => {
        secret = 'abc123';
        guard = new ClientTelegramWebhookGuard({
            webhookSecret: () => Promise.resolve(secret),
        } as unknown as ClientTelegramBotClient);
    });

    it('пускает запрос с секретом текущего токена', async () => {
        await expect(guard.canActivate(contextWith('abc123'))).resolves.toBe(
            true,
        );
    });

    it('чужой или пустой секрет — 401', async () => {
        await expect(guard.canActivate(contextWith('abc124'))).rejects.toThrow(
            'Неверный секрет',
        );
        await expect(guard.canActivate(contextWith())).rejects.toThrow(
            UnauthorizedException,
        );
    });

    it('токена нет — вебхук закрыт', async () => {
        secret = null;
        await expect(guard.canActivate(contextWith('abc123'))).rejects.toThrow(
            'не настроен',
        );
    });
});

describe('ClientTelegramWebhookRegistrar', () => {
    let secret: string | null;
    let url: string;
    let setWebhook: jest.Mock;
    let registrar: ClientTelegramWebhookRegistrar;
    const savedRole = process.env[APP_ROLE_ENV];

    beforeEach(() => {
        secret = 'secret-1';
        url = URL;
        setWebhook = jest.fn().mockResolvedValue(undefined);
        registrar = new ClientTelegramWebhookRegistrar(
            { telegramWebhookUrl: () => url } as unknown as CabinetConfig,
            {
                webhookSecret: () => Promise.resolve(secret),
                setWebhook,
            } as unknown as ClientTelegramBotClient,
        );
    });

    afterEach(() => {
        registrar.onApplicationShutdown();
        if (savedRole === undefined) delete process.env[APP_ROLE_ENV];
        else process.env[APP_ROLE_ENV] = savedRole;
    });

    it('регистрирует один раз, пока токен прежний', async () => {
        await registrar.sync();
        await registrar.sync();
        expect(setWebhook).toHaveBeenCalledTimes(1);
        expect(setWebhook).toHaveBeenCalledWith(URL, 'secret-1');
    });

    it('сменили токен в админке — перерегистрирует с новым секретом', async () => {
        await registrar.sync();
        secret = 'secret-2';
        await registrar.sync();
        expect(setWebhook).toHaveBeenLastCalledWith(URL, 'secret-2');
        expect(setWebhook).toHaveBeenCalledTimes(2);
    });

    it('ошибка Telegram — повторит на следующей сверке', async () => {
        setWebhook.mockRejectedValueOnce(new Error('Bad Request'));
        await registrar.sync();
        await registrar.sync();
        expect(setWebhook).toHaveBeenCalledTimes(2);
    });

    it('нет токена или адреса — в Telegram не ходит', async () => {
        secret = null;
        await registrar.sync();
        secret = 'secret-1';
        url = '';
        await registrar.sync();
        expect(setWebhook).not.toHaveBeenCalled();
    });

    it('на зеркале (standby) не регистрирует и не заводит таймер', async () => {
        process.env[APP_ROLE_ENV] = 'standby';
        const sync = jest.spyOn(registrar, 'sync');
        registrar.onApplicationBootstrap();
        await Promise.resolve();
        expect(sync).not.toHaveBeenCalled();
        expect(setWebhook).not.toHaveBeenCalled();
    });
});
