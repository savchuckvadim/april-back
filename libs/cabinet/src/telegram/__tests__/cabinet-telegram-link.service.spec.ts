import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TelegramBinding } from 'generated/prisma';
import { RedisService } from '@lib/core/redis/redis.service';
import { CabinetTelegramLinkService } from '../cabinet-telegram-link.service';
import { ClientTelegramBotClient } from '../client-telegram-bot.client';
import {
    CabinetTelegramBindingRepository,
    TelegramBindingWithPortal,
} from '../../persistence/cabinet-telegram-binding.repository';
import { CabinetThrottle } from '../../infrastructure/cabinet-throttle';
import { CabinetContext } from '../../domain/cabinet-context';

const PORTAL = {
    id: BigInt(12),
    domain: 'a.bitrix24.ru',
    memberId: 'member-1',
    clientId: BigInt(5),
    approvalStatus: null,
};

const FRAME_CTX: CabinetContext = {
    subject: {
        kind: 'frame',
        bitrixUserId: '7',
        isAdmin: false,
        portal: { portalId: 12 },
        login: 'bx',
    },
    portal: PORTAL,
    level: 'frame',
    membership: null,
};

/** Redis в памяти: get/set/del — как у ioredis. */
function memoryRedis() {
    const store = new Map<string, string>();
    return {
        store,
        client: {
            set: jest.fn((key: string, value: string) => {
                store.set(key, value);
                return Promise.resolve('OK');
            }),
            get: jest.fn((key: string) =>
                Promise.resolve(store.get(key) ?? null),
            ),
            del: jest.fn((key: string) =>
                Promise.resolve(store.delete(key) ? 1 : 0),
            ),
        },
    };
}

describe('CabinetTelegramLinkService (привязка Telegram кодом)', () => {
    let redis: ReturnType<typeof memoryRedis>;
    let bindings: jest.Mocked<
        Pick<
            CabinetTelegramBindingRepository,
            | 'upsertActive'
            | 'listActiveByPortal'
            | 'listActiveForPerson'
            | 'findById'
            | 'revoke'
        >
    >;
    let bot: jest.Mocked<
        Pick<ClientTelegramBotClient, 'isConfigured' | 'botUsername'>
    >;
    let service: CabinetTelegramLinkService;

    beforeEach(() => {
        redis = memoryRedis();
        bindings = {
            upsertActive: jest.fn().mockResolvedValue({
                portal: { domain: 'a.bitrix24.ru' },
            } as TelegramBindingWithPortal),
            listActiveByPortal: jest.fn().mockResolvedValue([]),
            listActiveForPerson: jest.fn().mockResolvedValue([]),
            findById: jest.fn(),
            revoke: jest.fn().mockResolvedValue(undefined),
        };
        bot = {
            isConfigured: jest.fn().mockResolvedValue(true),
            botUsername: jest.fn().mockResolvedValue('april_clients_bot'),
        };
        service = new CabinetTelegramLinkService(
            bindings as unknown as CabinetTelegramBindingRepository,
            bot as unknown as ClientTelegramBotClient,
            { getClient: () => redis.client } as unknown as RedisService,
            { hit: jest.fn(), reset: jest.fn() } as unknown as CabinetThrottle,
        );
    });

    it('код: 8 символов без похожих букв, ссылка t.me с кодом', async () => {
        const issued = await service.issueCode(FRAME_CTX);
        expect(issued.code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
        expect(issued.deepLink).toBe(
            `https://t.me/april_clients_bot?start=${issued.code}`,
        );
    });

    it('бот не настроен — понятная ошибка, код не выпускается', async () => {
        bot.isConfigured.mockResolvedValue(false);
        await expect(service.issueCode(FRAME_CTX)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(redis.client.set).not.toHaveBeenCalled();
    });

    it('/start КОД привязывает чат к сотруднику портала, код одноразовый', async () => {
        const { code } = await service.issueCode(FRAME_CTX);
        const chat = {
            chatId: BigInt(555),
            username: 'ivan',
            displayName: 'Иван',
        };

        await expect(
            service.consumeCode(code.toLowerCase(), chat),
        ).resolves.toEqual({
            domain: 'a.bitrix24.ru',
        });
        expect(bindings.upsertActive).toHaveBeenCalledWith(
            expect.objectContaining({
                portalId: BigInt(12),
                chatId: BigInt(555),
                bitrixUserId: '7',
                source: 'frame',
            }),
        );
        await expect(service.consumeCode(code, chat)).resolves.toBeNull();
    });

    it('мусорный и неизвестный код — null без обращения к БД', async () => {
        const chat = { chatId: BigInt(1), username: null, displayName: null };
        await expect(
            service.consumeCode('../../etc', chat),
        ).resolves.toBeNull();
        await expect(service.consumeCode('ABCDEFGH', chat)).resolves.toBeNull();
        expect(bindings.upsertActive).not.toHaveBeenCalled();
    });

    it('сотрудник видит свои привязки, владелец — все', async () => {
        await service.list(FRAME_CTX);
        expect(bindings.listActiveForPerson).toHaveBeenCalledWith(BigInt(12), {
            bitrixUserId: '7',
            userId: null,
        });
        await service.list({ ...FRAME_CTX, level: 'owner' });
        expect(bindings.listActiveByPortal).toHaveBeenCalledWith(BigInt(12));
    });

    it('чужую привязку сотрудник не отвязывает', async () => {
        bindings.findById.mockResolvedValue({
            id: 'b-1',
            portalId: BigInt(12),
            bitrixUserId: '99',
            userId: null,
            revokedAt: null,
        } as TelegramBinding);
        await expect(service.revoke(FRAME_CTX, 'b-1')).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(bindings.revoke).not.toHaveBeenCalled();
    });

    it('администратор April себе Telegram не привязывает', async () => {
        await expect(
            service.issueCode({
                ...FRAME_CTX,
                subject: { kind: 'platform', login: 'admin' },
                level: 'platform',
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
