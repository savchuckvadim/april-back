import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';

/** Сколько помним «уже делали» для действия при открытии карточки. */
export const OPEN_CARD_ONCE_TTL_SECONDS = 15 * 60;

/** Действия «Звонков» при открытии сделки, которые незачем повторять часто. */
export const OPEN_CARD_ACTIONS = [
    'inn-align',
    'client-type-align',
    'deal-owner-align',
] as const;
export type OpenCardAction = (typeof OPEN_CARD_ACTIONS)[number];

export interface IOpenCardOnceScope {
    action: OpenCardAction;
    domain: string;
    dealId: number;
    /** Действие зависит от того, кто открыл, — ключ на сотрудника. */
    userId?: number;
}

const KEY_PREFIX = 'event-sales:open-card';

/**
 * «Недавно уже делали» для действий при открытии карточки сделки
 * (выравнивание ИНН и типа клиента, перевод компании и контактов на
 * ответственного). Карточку открывают много раз в день, а эти действия
 * повторять каждый раз незачем — особенно когда им нечего выровнять.
 *
 * Отметка в Redis на 15 минут, общая для всех вкладок и сотрудников
 * (владелец 26.10.2026: не память вкладки браузера). Ставится ТОЛЬКО после
 * успешного действия: упавшее следующее открытие повторит. Redis недоступен
 * — действие выполняется, как будто отметки нет: потерянное выравнивание
 * хуже лишнего запроса.
 */
@Injectable()
export class OpenCardOnceGuard {
    private readonly logger = new Logger(OpenCardOnceGuard.name);

    constructor(private readonly redis: RedisService) {}

    async isRecent(scope: IOpenCardOnceScope): Promise<boolean> {
        try {
            return (await this.redis.getClient().get(this.key(scope))) !== null;
        } catch (error) {
            this.warn(scope, 'не проверена', error);
            return false;
        }
    }

    async remember(scope: IOpenCardOnceScope): Promise<void> {
        try {
            await this.redis
                .getClient()
                .set(this.key(scope), '1', 'EX', OPEN_CARD_ONCE_TTL_SECONDS);
        } catch (error) {
            this.warn(scope, 'не записана', error);
        }
    }

    private key(scope: IOpenCardOnceScope): string {
        const user = scope.userId ? `:u${scope.userId}` : '';
        return `${KEY_PREFIX}:${scope.action}:${scope.domain}:${scope.dealId}${user}`;
    }

    private warn(
        scope: IOpenCardOnceScope,
        what: string,
        error: unknown,
    ): void {
        this.logger.warn(
            `отметка ${scope.action} ${scope.domain}/${scope.dealId} ${what}: ` +
                (error instanceof Error ? error.message : String(error)),
        );
    }
}
