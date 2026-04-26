import { Injectable } from '@nestjs/common';

@Injectable()
export class BitrixImEventDataService {
    extractDialogId(data: Record<string, unknown>): string | undefined {
        const direct = this.pickString(data, [
            'dialogId',
            'dialog_id',
            'DIALOG_ID',
        ]);
        if (direct) return direct;

        const nestedMessage = this.asObject(data.message);
        if (!nestedMessage) return undefined;
        return this.pickString(nestedMessage, [
            'dialogId',
            'dialog_id',
            'DIALOG_ID',
        ]);
    }

    extractMessageId(data: Record<string, unknown>): number | undefined {
        const direct = this.pickNumber(data, [
            'messageId',
            'message_id',
            'MESSAGE_ID',
        ]);
        if (typeof direct === 'number') return direct;

        const nestedMessage = this.asObject(data.message);
        if (!nestedMessage) return undefined;
        return this.pickNumber(nestedMessage, [
            'messageId',
            'message_id',
            'MESSAGE_ID',
            'id',
        ]);
    }

    extractAuthorId(data: Record<string, unknown>): string | undefined {
        const direct = this.pickString(data, [
            'authorId',
            'author_id',
            'AUTHOR_ID',
        ]);
        if (direct) return direct;

        const nestedMessage = this.asObject(data.message);
        if (!nestedMessage) return undefined;
        return this.pickString(nestedMessage, [
            'authorId',
            'author_id',
            'AUTHOR_ID',
        ]);
    }

    extractText(data: Record<string, unknown>): string | undefined {
        const direct = this.pickString(data, ['text', 'message', 'MESSAGE']);
        if (direct) return direct;

        const nestedMessage = this.asObject(data.message);
        if (!nestedMessage) return undefined;
        return this.pickString(nestedMessage, ['text', 'message', 'MESSAGE']);
    }

    isSystemMessage(data: Record<string, unknown>, authorId?: string): boolean {
        if (!authorId || authorId === '0') return true;

        const nestedMessage = this.asObject(data.message);
        const params = this.asObject(nestedMessage?.params ?? data.params);
        if (!params) return false;

        const systemCode = this.pickString(params, ['CODE', 'code']);
        return Boolean(systemCode);
    }

    isBotMessage(data: Record<string, unknown>): boolean {
        const candidates = [
            this.asObject(data.author),
            this.asObject(data.user),
            this.asObject(data.message),
            this.asObject(this.asObject(data.message)?.author),
        ].filter(Boolean) as Record<string, unknown>[];

        for (const candidate of candidates) {
            const bot = candidate.BOT ?? candidate.bot ?? candidate.isBot;
            if (bot === true || bot === 'Y' || bot === '1' || bot === 1) {
                return true;
            }
            const userType = this.pickString(candidate, [
                'USER_TYPE',
                'userType',
            ]);
            if (userType?.toLowerCase() === 'bot') {
                return true;
            }
        }

        return false;
    }

    private pickString(
        data: Record<string, unknown>,
        keys: string[],
    ): string | undefined {
        for (const key of keys) {
            const value = data[key];
            if (typeof value === 'string' && value.trim()) {
                return value;
            }
            if (typeof value === 'number') {
                return String(value);
            }
        }
        return undefined;
    }

    private pickNumber(
        data: Record<string, unknown>,
        keys: string[],
    ): number | undefined {
        for (const key of keys) {
            const value = data[key];
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
            if (typeof value === 'string') {
                const parsed = Number(value);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }
        }
        return undefined;
    }

    private asObject(value: unknown): Record<string, unknown> | undefined {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return undefined;
        }
        return value as Record<string, unknown>;
    }
}
