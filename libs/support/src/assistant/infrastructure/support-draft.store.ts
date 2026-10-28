import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from '@lib/core/redis/redis.service';
import { SupportDraft } from '../domain/support-assistant.types';

/** Черновик живёт сутки: дольше ответ клиенту уже не актуален. */
const DRAFT_TTL_SEC = 24 * 60 * 60;

const PREFIX = 'support-assistant';

/** Разбор черновика из Redis; испорченная запись — как будто черновика нет. */
export function parseSupportDraft(raw: string | null): SupportDraft | null {
    if (!raw) return null;
    try {
        const value = JSON.parse(raw) as Partial<SupportDraft>;
        if (
            typeof value?.id !== 'string' ||
            typeof value.chatId !== 'number' ||
            typeof value.lineDomain !== 'string' ||
            typeof value.replyText !== 'string' ||
            typeof value.analysis?.draftReply !== 'string'
        ) {
            return null;
        }
        return value as SupportDraft;
    } catch {
        return null;
    }
}

/**
 * Черновики ответов в Redis и привязка «сообщение Telegram → черновик»,
 * чтобы правка ответом на сообщение находила свой черновик. Базы данных
 * и миграций не нужно.
 */
@Injectable()
export class SupportDraftStore {
    private readonly redis: Redis;

    constructor(redisService: RedisService) {
        this.redis = redisService.getClient();
    }

    async save(draft: SupportDraft): Promise<void> {
        await this.redis.set(
            this.draftKey(draft.id),
            JSON.stringify(draft),
            'EX',
            DRAFT_TTL_SEC,
        );
    }

    async load(id: string): Promise<SupportDraft | null> {
        return parseSupportDraft(await this.redis.get(this.draftKey(id)));
    }

    async delete(id: string): Promise<void> {
        await this.redis.del(this.draftKey(id));
    }

    /** Сообщение Telegram с черновиком → id черновика. */
    async bindMessage(
        chatId: number | string,
        messageId: number,
        draftId: string,
    ): Promise<void> {
        await this.redis.set(
            this.messageKey(chatId, messageId),
            draftId,
            'EX',
            DRAFT_TTL_SEC,
        );
    }

    async draftIdOfMessage(
        chatId: number | string,
        messageId: number,
    ): Promise<string | null> {
        return this.redis.get(this.messageKey(chatId, messageId));
    }

    private draftKey(id: string): string {
        return `${PREFIX}:draft:${id}`;
    }

    private messageKey(chatId: number | string, messageId: number): string {
        return `${PREFIX}:tg:${chatId}:${messageId}`;
    }
}
