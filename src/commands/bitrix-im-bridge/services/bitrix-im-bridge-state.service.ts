import { Injectable } from '@nestjs/common';
import { RedisService } from '@/core/redis/redis.service';
import { BridgeReplyContext } from '../interfaces/bridge.types';

@Injectable()
export class BitrixImBridgeStateService {
    private readonly keyPrefix = 'bitrix-im-bridge';

    constructor(private readonly redisService: RedisService) {}

    async getOffset(domain: string): Promise<number | undefined> {
        const raw = await this.redisService
            .getClient()
            .get(`${this.keyPrefix}:offset:${domain}`);
        if (!raw) return undefined;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    async setOffset(domain: string, offset: number): Promise<void> {
        await this.redisService
            .getClient()
            .set(`${this.keyPrefix}:offset:${domain}`, String(offset));
    }

    async getBridgeUserId(domain: string): Promise<string | undefined> {
        const value = await this.redisService
            .getClient()
            .get(`${this.keyPrefix}:bridge-user:${domain}`);
        return value || undefined;
    }

    async setBridgeUserId(domain: string, userId: string): Promise<void> {
        await this.redisService
            .getClient()
            .set(`${this.keyPrefix}:bridge-user:${domain}`, userId);
    }

    async setReplyContext(
        telegramMessageId: number,
        context: BridgeReplyContext,
    ): Promise<void> {
        await this.redisService
            .getClient()
            .set(
                `${this.keyPrefix}:reply-context:${telegramMessageId}`,
                JSON.stringify(context),
                'EX',
                60 * 60 * 24 * 7,
            );
    }

    async getReplyContext(
        telegramMessageId: number,
    ): Promise<BridgeReplyContext | undefined> {
        const raw = await this.redisService
            .getClient()
            .get(`${this.keyPrefix}:reply-context:${telegramMessageId}`);
        if (!raw) return undefined;
        try {
            return JSON.parse(raw) as BridgeReplyContext;
        } catch {
            return undefined;
        }
    }

    async setLastReplyContextByChat(
        telegramChatId: number,
        context: BridgeReplyContext,
    ): Promise<void> {
        await this.redisService
            .getClient()
            .set(
                `${this.keyPrefix}:last-reply-context:${telegramChatId}`,
                JSON.stringify(context),
                'EX',
                60 * 60 * 24 * 7,
            );
    }

    async getLastReplyContextByChat(
        telegramChatId: number,
    ): Promise<BridgeReplyContext | undefined> {
        const raw = await this.redisService
            .getClient()
            .get(`${this.keyPrefix}:last-reply-context:${telegramChatId}`);
        if (!raw) return undefined;
        try {
            return JSON.parse(raw) as BridgeReplyContext;
        } catch {
            return undefined;
        }
    }
}
