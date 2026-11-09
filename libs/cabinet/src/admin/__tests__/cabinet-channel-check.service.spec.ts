import { NotFoundException } from '@nestjs/common';
import { TelegramBinding } from 'generated/prisma';
import { CabinetContext } from '../../domain/cabinet-context';
import { CabinetTelegramBindingRepository } from '../../persistence/cabinet-telegram-binding.repository';
import { ClientTelegramBotClient } from '../../telegram/client-telegram-bot.client';
import { CabinetChannelCheckService } from '../cabinet-channel-check.service';

const CTX = {
    portal: {
        id: 7n,
        domain: 'client.bitrix24.ru',
        memberId: 'mid',
        clientId: null,
        approvalStatus: null,
    },
} as unknown as CabinetContext;

const binding = (overrides: Partial<TelegramBinding> = {}): TelegramBinding =>
    ({
        id: 'b-1',
        portalId: 7n,
        chatId: 12345n,
        revokedAt: null,
        ...overrides,
    }) as TelegramBinding;

function setup() {
    const bindings = { findById: jest.fn().mockResolvedValue(binding()) };
    const bot = {
        isConfigured: jest.fn().mockResolvedValue(true),
        trySendMessage: jest.fn().mockResolvedValue(null),
    };
    const service = new CabinetChannelCheckService(
        bindings as unknown as CabinetTelegramBindingRepository,
        bot as unknown as ClientTelegramBotClient,
    );
    return { service, bindings, bot };
}

describe('CabinetChannelCheckService', () => {
    it('Telegram: доставлено в чат привязки', async () => {
        const { service, bot } = setup();
        await expect(service.testTelegramBinding(CTX, 'b-1')).resolves.toEqual({
            ok: true,
            message: 'Сообщение доставлено в чат.',
        });
        expect(bot.trySendMessage).toHaveBeenCalledWith(
            12345n,
            expect.stringContaining('client.bitrix24.ru'),
        );
    });

    it('Telegram: бот заблокирован — понятная причина', async () => {
        const { service, bot } = setup();
        bot.trySendMessage.mockResolvedValue(
            'sendMessage: Forbidden: bot was blocked by the user',
        );
        const result = await service.testTelegramBinding(CTX, 'b-1');
        expect(result.ok).toBe(false);
        expect(result.message).toContain('заблокировал бота');
    });

    it('чужая или отозванная привязка, нет токена', async () => {
        const { service, bindings, bot } = setup();
        bindings.findById.mockResolvedValueOnce(binding({ portalId: 8n }));
        await expect(
            service.testTelegramBinding(CTX, 'b-1'),
        ).rejects.toBeInstanceOf(NotFoundException);

        bindings.findById.mockResolvedValueOnce(
            binding({ revokedAt: new Date() }),
        );
        await expect(
            service.testTelegramBinding(CTX, 'b-1'),
        ).resolves.toMatchObject({ ok: false });

        bot.isConfigured.mockResolvedValueOnce(false);
        const noToken = await service.testTelegramBinding(CTX, 'b-1');
        expect(noToken.message).toContain('Токен клиентского бота не задан');
        expect(bot.trySendMessage).not.toHaveBeenCalled();
    });
});
