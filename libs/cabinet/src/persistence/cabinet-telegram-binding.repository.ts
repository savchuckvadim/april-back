import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Portal, TelegramBinding } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import { CabinetTelegramSource } from '../domain/cabinet.constants';

/** Чей чат: сотрудник портала (Битрикс) и/или учётка кабинета. */
export interface TelegramPerson {
    bitrixUserId?: string | null;
    userId?: bigint | null;
}

export interface UpsertTelegramBindingInput extends TelegramPerson {
    portalId: bigint;
    chatId: bigint;
    telegramUsername: string | null;
    displayName: string | null;
    source: CabinetTelegramSource;
}

export type TelegramBindingWithPortal = TelegramBinding & { portal: Portal };

/**
 * Привязки Telegram-чатов (`telegram_bindings`). Пара портал + чат
 * уникальна: повторная привязка того же чата обновляет строку (и снимает
 * отметку об отвязке).
 */
@Injectable()
export class CabinetTelegramBindingRepository {
    constructor(private readonly prisma: PrismaService) {}

    listActiveByPortal(portalId: bigint): Promise<TelegramBinding[]> {
        return this.prisma.telegramBinding.findMany({
            where: { portalId, revokedAt: null },
            orderBy: { createdAt: 'desc' },
        });
    }

    /** Действующие чаты человека на портале (по Битрикс-ID или учётке). */
    listActiveForPerson(
        portalId: bigint,
        person: TelegramPerson,
    ): Promise<TelegramBinding[]> {
        const or = [
            ...(person.bitrixUserId
                ? [{ bitrixUserId: person.bitrixUserId }]
                : []),
            ...(person.userId ? [{ userId: person.userId }] : []),
        ];
        if (or.length === 0) return Promise.resolve([]);
        return this.prisma.telegramBinding.findMany({
            where: { portalId, revokedAt: null, OR: or },
            orderBy: { createdAt: 'desc' },
        });
    }

    findById(id: string): Promise<TelegramBinding | null> {
        return this.prisma.telegramBinding.findUnique({ where: { id } });
    }

    async upsertActive(
        input: UpsertTelegramBindingInput,
    ): Promise<TelegramBindingWithPortal> {
        const now = new Date();
        const data = {
            userId: input.userId ?? null,
            bitrixUserId: input.bitrixUserId ?? null,
            telegramUsername: input.telegramUsername,
            displayName: input.displayName,
            createdBy: input.source,
            revokedAt: null,
            updatedAt: now,
        };
        return this.prisma.telegramBinding.upsert({
            where: {
                portalId_chatId: {
                    portalId: input.portalId,
                    chatId: input.chatId,
                },
            },
            create: {
                id: randomUUID(),
                portalId: input.portalId,
                chatId: input.chatId,
                createdAt: now,
                ...data,
            },
            update: data,
            include: { portal: true },
        });
    }

    async revoke(id: string): Promise<void> {
        await this.prisma.telegramBinding.update({
            where: { id },
            data: { revokedAt: new Date(), updatedAt: new Date() },
        });
    }

    /** `/stop` в боте: чат отвязывается от всех порталов. */
    async revokeByChat(chatId: bigint): Promise<number> {
        const { count } = await this.prisma.telegramBinding.updateMany({
            where: { chatId, revokedAt: null },
            data: { revokedAt: new Date(), updatedAt: new Date() },
        });
        return count;
    }
}
