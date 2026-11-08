import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { TelegramBinding } from 'generated/prisma';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    CABINET_DEFAULTS,
    CabinetTelegramSource,
    hasCabinetLevel,
} from '../domain/cabinet.constants';
import { CabinetContext } from '../domain/cabinet-context';
import { requirePortal } from '../members/cabinet-membership.service';
import {
    CabinetTelegramBindingRepository,
    TelegramPerson,
} from '../persistence/cabinet-telegram-binding.repository';
import { CabinetThrottle } from '../infrastructure/cabinet-throttle';
import { ClientTelegramBotClient } from './client-telegram-bot.client';

/** Код без похожих символов (0/O, 1/I/L): его иногда вводят руками. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_KEY_PREFIX = 'cabinet:tg:code:';
const CODE_LIMIT = 10;
const CODE_WINDOW_SECONDS = 3600;

interface StoredCode {
    portalId: string;
    bitrixUserId: string | null;
    userId: string | null;
    source: CabinetTelegramSource;
}

export interface IssuedTelegramCode {
    code: string;
    /** https://t.me/<бот>?start=<код>; null — Telegram не сообщил имя бота. */
    deepLink: string | null;
    botUsername: string | null;
    expiresAt: string;
}

export interface TelegramChatInfo {
    chatId: bigint;
    username: string | null;
    displayName: string | null;
}

export interface TelegramBindingView {
    id: string;
    bitrixUserId: string | null;
    userId: number | null;
    telegramUsername: string | null;
    displayName: string | null;
    createdBy: string | null;
    createdAt: string | null;
}

/**
 * Привязка Telegram к человеку на портале одноразовым кодом (10 минут,
 * Redis — общий для всех реплик и зеркала): кнопка в кабинете → код →
 * человек пишет боту `/start <код>` → чат привязан. Никакого ввода домена:
 * портал и человек берутся из проверенной сессии кабинета.
 */
@Injectable()
export class CabinetTelegramLinkService {
    private readonly logger = new Logger(CabinetTelegramLinkService.name);

    constructor(
        private readonly bindings: CabinetTelegramBindingRepository,
        private readonly bot: ClientTelegramBotClient,
        private readonly redisService: RedisService,
        private readonly throttle: CabinetThrottle,
    ) {}

    async issueCode(ctx: CabinetContext): Promise<IssuedTelegramCode> {
        const portal = requirePortal(ctx);
        const person = personOf(ctx);
        if (!(await this.bot.isConfigured())) {
            throw new BadRequestException(
                'Telegram-бот April ещё не подключён — попробуйте позже',
            );
        }
        await this.throttle.hit(
            `tg-code:${portal.id}:${person.bitrixUserId ?? ''}:${person.userId ?? ''}`,
            CODE_LIMIT,
            CODE_WINDOW_SECONDS,
            'Слишком много кодов — попробуйте через час',
        );
        const code = generateCode();
        const stored: StoredCode = {
            portalId: portal.id.toString(),
            bitrixUserId: person.bitrixUserId ?? null,
            userId: person.userId?.toString() ?? null,
            source: ctx.subject.kind === 'frame' ? 'frame' : 'site',
        };
        await this.redisService
            .getClient()
            .set(
                `${CODE_KEY_PREFIX}${code}`,
                JSON.stringify(stored),
                'EX',
                CABINET_DEFAULTS.telegramCodeTtlSeconds,
            );
        const botUsername = await this.bot.botUsername();
        return {
            code,
            deepLink: botUsername
                ? `https://t.me/${botUsername}?start=${code}`
                : null,
            botUsername,
            expiresAt: new Date(
                Date.now() + CABINET_DEFAULTS.telegramCodeTtlSeconds * 1000,
            ).toISOString(),
        };
    }

    /** `/start <код>` от бота: код сгорает; null — нет такого или истёк. */
    async consumeCode(
        rawCode: string,
        chat: TelegramChatInfo,
    ): Promise<{ domain: string | null } | null> {
        const code = rawCode.trim().toUpperCase();
        if (!/^[A-Z0-9]{8}$/.test(code)) return null;
        const redis = this.redisService.getClient();
        const key = `${CODE_KEY_PREFIX}${code}`;
        const raw = await redis.get(key);
        if (!raw) return null;
        // Код одноразовый: удалил первый — второй (параллельный) не пройдёт.
        if ((await redis.del(key)) === 0) return null;
        const stored = parseStored(raw);
        if (!stored) return null;
        const binding = await this.bindings.upsertActive({
            portalId: BigInt(stored.portalId),
            chatId: chat.chatId,
            bitrixUserId: stored.bitrixUserId,
            userId: stored.userId ? BigInt(stored.userId) : null,
            telegramUsername: chat.username,
            displayName: chat.displayName,
            source: stored.source,
        });
        this.logger.log(
            `Telegram: чат привязан к порталу ${binding.portal.domain ?? stored.portalId}`,
        );
        return { domain: binding.portal.domain };
    }

    /** Владелец и April видят все привязки портала, остальные — свои. */
    async list(ctx: CabinetContext): Promise<TelegramBindingView[]> {
        const portal = requirePortal(ctx);
        const rows = hasCabinetLevel(ctx.level, 'owner')
            ? await this.bindings.listActiveByPortal(portal.id)
            : await this.bindings.listActiveForPerson(portal.id, personOf(ctx));
        return rows.map(toBindingView);
    }

    async revoke(ctx: CabinetContext, bindingId: string): Promise<void> {
        const portal = requirePortal(ctx);
        const row = await this.bindings.findById(bindingId);
        if (!row || row.portalId !== portal.id || row.revokedAt) {
            throw new NotFoundException('Привязка не найдена');
        }
        if (
            !hasCabinetLevel(ctx.level, 'owner') &&
            !isOwn(row, personOf(ctx))
        ) {
            throw new ForbiddenException('Можно отвязать только свой Telegram');
        }
        await this.bindings.revoke(row.id);
    }
}

/** Кого привязываем: из фрейма — сотрудник портала, с сайта — учётка. */
function personOf(ctx: CabinetContext): TelegramPerson {
    const subject = ctx.subject;
    if (subject.kind === 'frame') {
        return {
            bitrixUserId: subject.bitrixUserId,
            userId: ctx.membership?.userId ?? null,
        };
    }
    if (subject.kind === 'account') {
        return {
            userId: subject.userId,
            bitrixUserId: ctx.membership?.bitrixUserId ?? null,
        };
    }
    throw new BadRequestException(
        'Telegram привязывается к сотруднику портала — откройте кабинет его сессией',
    );
}

function isOwn(row: TelegramBinding, person: TelegramPerson): boolean {
    return Boolean(
        (person.bitrixUserId && row.bitrixUserId === person.bitrixUserId) ||
            (person.userId && row.userId === person.userId),
    );
}

function generateCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
        code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    return code;
}

function parseStored(raw: string): StoredCode | null {
    try {
        const value = JSON.parse(raw) as Partial<StoredCode>;
        return typeof value.portalId === 'string' &&
            /^\d+$/.test(value.portalId)
            ? {
                  portalId: value.portalId,
                  bitrixUserId: value.bitrixUserId ?? null,
                  userId: value.userId ?? null,
                  source: value.source ?? 'site',
              }
            : null;
    } catch {
        return null;
    }
}

export function toBindingView(row: TelegramBinding): TelegramBindingView {
    return {
        id: row.id,
        bitrixUserId: row.bitrixUserId,
        userId: row.userId !== null ? Number(row.userId) : null,
        telegramUsername: row.telegramUsername,
        displayName: row.displayName,
        createdBy: row.createdBy,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    };
}
