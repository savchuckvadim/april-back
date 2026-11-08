import { ConfigService } from '@nestjs/config';
import { Prisma } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import { CabinetConfig } from '../../config/cabinet.config';
import { ClientTelegramBotClient } from '../../telegram/client-telegram-bot.client';
import { buildCabinetChecklist } from '../cabinet-guide.checklist';
import { CABINET_GUIDE_SECTIONS } from '../cabinet-guide.content';
import { CabinetCorsProbe } from '../cabinet-cors.probe';
import { CabinetGuideService } from '../cabinet-guide.service';
import type { CabinetGuideFacts } from '../cabinet-guide.types';

const READY: CabinetGuideFacts = {
    tablesReady: true,
    authJwtSecretSet: true,
    authEnabled: true,
    cookieDomain: '.april-app.ru',
    cors: 'ok',
    siteUrl: 'https://bitrix.april-app.ru',
    botTokenSet: true,
    botUsername: 'AprilReportBot',
    webhookUrl: 'https://api.bot.april-app.ru/api/cabinet/telegram/webhook',
    mailHost: 'smtp.example.ru',
};

const statusOf = (facts: CabinetGuideFacts) =>
    Object.fromEntries(
        buildCabinetChecklist(facts).map(item => [item.key, item.status]),
    );

describe('чек-лист кабинета', () => {
    it('всё настроено — автоматические пункты готовы, ручные остаются ручными', () => {
        const checks = buildCabinetChecklist(READY);
        expect(
            checks.filter(item => item.status === 'todo').map(item => item.key),
        ).toEqual([]);
        expect(
            checks
                .filter(item => item.status === 'manual')
                .map(item => item.key),
        ).toEqual(['webhook-live', 'e2e']);
        expect(checks.find(item => item.key === 'bot-token')?.hint).toContain(
            '@AprilReportBot',
        );
    });

    it('ничего не настроено — каждый автоматический пункт говорит, что сделать', () => {
        const statuses = statusOf({
            tablesReady: false,
            authJwtSecretSet: false,
            authEnabled: false,
            cookieDomain: null,
            cors: 'blocked',
            siteUrl: 'https://bitrix.april-app.ru',
            botTokenSet: false,
            botUsername: null,
            webhookUrl: '',
            mailHost: '',
        });
        for (const key of [
            'migrations',
            'jwt',
            'auth-enabled',
            'cookie-domain',
            'cors',
            'bot-token',
            'webhook-url',
            'mail',
        ]) {
            expect(statuses[key]).toBe('todo');
        }
    });

    it('токен есть, а Telegram его не узнал — не готово, подсказка про отзыв и прокси', () => {
        const bot = buildCabinetChecklist({
            ...READY,
            botUsername: null,
        }).find(item => item.key === 'bot-token');
        expect(bot?.status).toBe('todo');
        expect(bot?.hint).toContain('неверный или отозван');
    });

    it('разделы: уникальные коды, у каждого есть текст', () => {
        const keys = CABINET_GUIDE_SECTIONS.map(section => section.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const section of CABINET_GUIDE_SECTIONS) {
            expect(section.markdown.length).toBeGreaterThan(100);
        }
    });
});

describe('проверка CORS в чек-листе', () => {
    it('api.pbx не ответил — проверить вручную, а не «не сделано»', () => {
        const cors = buildCabinetChecklist({
            ...READY,
            cors: 'unreachable',
        }).find(item => item.key === 'cors');
        expect(cors?.status).toBe('manual');
    });

    it('не пускает — подсказка про CORS_ORIGIN окружения pbx и apps/pbx/.env', () => {
        const cors = buildCabinetChecklist({ ...READY, cors: 'blocked' }).find(
            item => item.key === 'cors',
        );
        expect(cors?.status).toBe('todo');
        expect(cors?.hint).toContain('apps/pbx/.env');
    });
});

describe('CabinetGuideService', () => {
    function setup(prisma: unknown) {
        const env: Record<string, string> = {
            AUTH_JWT_SECRET: 'x',
            AUTH_ENABLED: 'true',
            MAIL_HOST: '',
        };
        return new CabinetGuideService(
            prisma as PrismaService,
            {
                cookieDomain: () => '.april-app.ru',
                siteUrl: () => 'https://bitrix.april-app.ru',
                telegramWebhookUrl: () => '',
            } as unknown as CabinetConfig,
            { get: (key: string) => env[key] } as unknown as ConfigService,
            {
                isConfigured: () => Promise.resolve(true),
                botUsername: () => Promise.resolve('AprilReportBot'),
            } as unknown as ClientTelegramBotClient,
            {
                check: () => Promise.resolve('ok'),
            } as unknown as CabinetCorsProbe,
        );
    }

    it('считает подключённые порталы, участников и привязки', async () => {
        const count = jest.fn().mockResolvedValue(3);
        const guide = await setup({
            portal: {
                count: jest
                    .fn()
                    .mockResolvedValueOnce(10)
                    .mockResolvedValueOnce(4),
            },
            portalUser: {
                count,
                groupBy: jest
                    .fn()
                    .mockResolvedValue([{ portalId: 1n }, { portalId: 2n }]),
            },
            telegramBinding: { count: jest.fn().mockResolvedValue(5) },
        }).build();
        expect(guide.counters).toEqual({
            portals: 10,
            portalsWithClient: 4,
            portalsWithOwner: 2,
            members: 3,
            pending: 3,
            telegramBindings: 5,
        });
        const statuses = Object.fromEntries(
            guide.checklist.map(item => [item.key, item.status]),
        );
        expect(statuses).toMatchObject({
            migrations: 'done',
            cors: 'done',
            'bot-token': 'done',
            'webhook-url': 'todo',
            mail: 'todo',
        });
    });

    it('таблиц нет (миграции не применены) — счётчиков нет, пункт «миграции» не готов', async () => {
        const missing = new Prisma.PrismaClientKnownRequestError(
            'table does not exist',
            { code: 'P2021', clientVersion: 'test' },
        );
        const guide = await setup({
            portal: { count: jest.fn().mockResolvedValue(10) },
            portalUser: {
                count: jest.fn().mockRejectedValue(missing),
                groupBy: jest.fn().mockRejectedValue(missing),
            },
            telegramBinding: { count: jest.fn().mockRejectedValue(missing) },
        }).build();
        expect(guide.counters).toBeNull();
        expect(
            guide.checklist.find(item => item.key === 'migrations')?.status,
        ).toBe('todo');
    });
});
