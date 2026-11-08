import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { EgressProxyService } from '@lib/egress-proxy';
import { VendorSettingsReader } from '@lib/vendor-settings';
import { VendorTelegramBotsService } from '../services/vendor-telegram-bots.service';

const CLIENT = '111:client';
const SUPPORT = '222:support';
const ALERTS = '333:alerts';

const USERNAMES: Record<string, string> = {
    [CLIENT]: 'AprilReportBot',
    [SUPPORT]: 'AprilSupportBot',
    [ALERTS]: 'AprilAlertsBot',
};

function setup(admin: Record<string, string>, env: Record<string, string>) {
    const post = jest.fn((url: string) => {
        const token = /\/bot([^/]+)\/getMe$/.exec(url)?.[1] ?? '';
        const username = USERNAMES[token];
        return username
            ? of({ data: { ok: true, result: { username } } })
            : throwError(() => new Error('getMe: Unauthorized'));
    });
    const reader: VendorSettingsReader = {
        get: key => Promise.resolve(admin[key] ?? null),
        getMany: () => Promise.resolve({}),
    };
    const service = new VendorTelegramBotsService(
        { post } as unknown as HttpService,
        {
            route: (url: string) => ({ url, headers: {}, viaProxy: false }),
        } as unknown as EgressProxyService,
        { get: (key: string) => env[key] } as unknown as ConfigService,
        reader,
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
        expect(support.status).toBe('not-set');
        expect(post).toHaveBeenCalledTimes(1);
    });
});
