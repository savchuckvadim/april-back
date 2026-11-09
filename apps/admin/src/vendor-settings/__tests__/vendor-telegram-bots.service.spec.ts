import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { EgressProxyService } from '@lib/egress-proxy';
import { VendorSettingsReader } from '@lib/vendor-settings';
import { TelegramBotsCatalog } from '../services/telegram-bots.catalog';
import { VendorTelegramBotsService } from '../services/vendor-telegram-bots.service';

const CLIENT = '111:client';
const SUPPORT = '222:support';
const ALERTS = '333:alerts';

const USERNAMES: Record<string, string> = {
    [CLIENT]: 'AprilReportBot',
    [SUPPORT]: 'AprilSupportBot',
    [ALERTS]: 'AprilAlertsBot',
};

const WEBHOOKS: Record<string, Record<string, unknown>> = {
    [CLIENT]: {
        url: 'https://api.bot.april-app.ru/api/cabinet/telegram/webhook',
        pending_update_count: 0,
    },
    [SUPPORT]: {
        url: '',
        pending_update_count: 3,
        last_error_message: 'Wrong response from the webhook: 401 Unauthorized',
        last_error_date: 1794146000,
    },
};

export function setupCatalog(
    admin: Record<string, string>,
    env: Record<string, string>,
): TelegramBotsCatalog {
    const reader: VendorSettingsReader = {
        get: key => Promise.resolve(admin[key] ?? null),
        getMany: () => Promise.resolve({}),
    };
    return new TelegramBotsCatalog(
        { get: (key: string) => env[key] } as unknown as ConfigService,
        reader,
    );
}

function setup(admin: Record<string, string>, env: Record<string, string>) {
    const post = jest.fn((url: string) => {
        const [, token = '', method = ''] =
            /\/bot([^/]+)\/([a-zA-Z]+)$/.exec(url) ?? [];
        const username = USERNAMES[token];
        if (!username) {
            return throwError(() => new Error('Unauthorized'));
        }
        return of({
            data: {
                ok: true,
                result:
                    method === 'getWebhookInfo'
                        ? (WEBHOOKS[token] ?? {})
                        : { username },
            },
        });
    });
    const service = new VendorTelegramBotsService(
        { post } as unknown as HttpService,
        {
            route: (url: string) => ({ url, headers: {}, viaProxy: false }),
            resolveRoute: (url: string) =>
                Promise.resolve({ url, headers: {}, viaProxy: false }),
        } as unknown as EgressProxyService,
        setupCatalog(admin, env),
    );
    return { service, post };
}

describe('VendorTelegramBotsService', () => {
    it('показывает, какой бот стоит в каждом токене; токены наружу не отдаёт', async () => {
        const { service } = setup(
            {
                CABINET_TELEGRAM_BOT_TOKEN: CLIENT,
                SUPPORT_TELEGRAM_BOT_TOKEN: SUPPORT,
            },
            { TELEGRAM_BOT_TOKEN: ALERTS },
        );
        const bots = await service.check();
        expect(
            bots.map(bot => [bot.key, bot.place, bot.status, bot.username]),
        ).toEqual([
            ['CABINET_TELEGRAM_BOT_TOKEN', 'admin', 'ok', 'AprilReportBot'],
            ['SUPPORT_TELEGRAM_BOT_TOKEN', 'admin', 'ok', 'AprilSupportBot'],
            ['TELEGRAM_BOT_TOKEN', 'env', 'ok', 'AprilAlertsBot'],
        ]);
        expect(JSON.stringify(bots)).not.toContain(CLIENT);
        expect(bots.every(bot => bot.sameTokenAs.length === 0)).toBe(true);
        expect(bots.map(bot => bot.canTest)).toEqual([false, true, true]);
    });

    it('вебхук: адрес, очередь и последняя ошибка; у бота тревог вебхука нет', async () => {
        const { service } = setup(
            {
                CABINET_TELEGRAM_BOT_TOKEN: CLIENT,
                SUPPORT_TELEGRAM_BOT_TOKEN: SUPPORT,
            },
            { TELEGRAM_BOT_TOKEN: ALERTS },
        );
        const [client, support, alerts] = await service.check();
        expect(client.webhook).toEqual({
            url: 'https://api.bot.april-app.ru/api/cabinet/telegram/webhook',
            pending: 0,
            lastError: null,
            lastErrorAt: null,
        });
        expect(support.webhook).toMatchObject({
            url: null,
            pending: 3,
            lastError: expect.stringContaining('401') as unknown,
        });
        expect(support.webhook?.lastErrorAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(alerts.webhook).toBeNull();
    });

    it('один токен в двух местах — предупреждение у обоих', async () => {
        const { service } = setup(
            {
                CABINET_TELEGRAM_BOT_TOKEN: SUPPORT,
                SUPPORT_TELEGRAM_BOT_TOKEN: SUPPORT,
            },
            {},
        );
        const [client, support, alerts] = await service.check();
        expect(client.sameTokenAs).toEqual([support.title]);
        expect(support.sameTokenAs).toEqual([client.title]);
        expect(alerts.status).toBe('not-set');
        expect(alerts.sameTokenAs).toEqual([]);
    });

    it('неверный токен — понятная ошибка; пустой — в Telegram не ходим', async () => {
        const { service, post } = setup(
            { CABINET_TELEGRAM_BOT_TOKEN: '999:revoked' },
            {},
        );
        const [client, support] = await service.check();
        expect(client.status).toBe('error');
        expect(client.error).toContain('неверный или отозван');
        expect(client.webhook).toBeNull();
        expect(support.status).toBe('not-set');
        // getMe + getWebhookInfo — только для заданного токена
        expect(post).toHaveBeenCalledTimes(2);
    });
});
